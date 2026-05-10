import prisma from '@models/prisma.client';
import type { PrismaClient } from '@prisma/client';
import PaginationUtils, { type PaginationResult } from '@utils/pagination.utils';

// ─── Types ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = Record<string, any>;

export interface FieldMappings {
  exact?: string[];
  numeric?: string[];
  number?: string[];
  date?: string[];
  text?: string[];
}

interface WhereClause {
  AND?: Record<string, unknown>[];
  OR?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface FindAllOptions {
  fieldMappings?: FieldMappings;
  additionalWhere?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
}

export interface FindAllWithoutPaginationOptions {
  searchParams?: Record<string, unknown>;
  additionalWhere?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

export interface FindByIdOptions {
  include?: Record<string, unknown>;
  additionalWhere?: Record<string, unknown>;
}

export interface FindOneOptions {
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface FindAllMongoOptions {
  /** Override per-call; falls back to the subclass _fieldMappings. */
  fieldMappings?: FieldMappings;
  /** Extra raw MongoDB match conditions appended to $and. */
  additionalWhere?: Record<string, unknown>[];
  /** MongoDB sort — use 1 (asc) / -1 (desc). Defaults to createdAt desc. */
  orderBy?: Record<string, 1 | -1>;
  /** Custom $project stage. When omitted, _id is hidden and id (string) is added. */
  project?: Record<string, unknown>;
}

// ─── Module-level constants ───────────────────────────────────────────────────
// Compiled once — reused on every date-field check
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Memoized Prisma delegate — avoids repeated cast on every query
const _delegateCache = new Map<string, AnyDelegate>();
function getDelegate(model: string): AnyDelegate {
  let d = _delegateCache.get(model);
  if (!d) {
    d = (prisma as unknown as Record<string, AnyDelegate>)[model];
    _delegateCache.set(model, d);
  }
  return d;
}

// ─── BaseRepository ───────────────────────────────────────────────────────────
/**
 * BaseRepository — abstract base for all model-specific repositories.
 *
 * Subclasses MUST set:
 *   static _modelName     = '<prisma model name>';
 *   static _fieldMappings = { exact:[], numeric:[], date:[], text:[] };
 *
 * Optionally override _defaultInclude for default eager-loading.
 */
class BaseRepository {
  static _modelName: string = '';
  static _fieldMappings: FieldMappings = {};
  static _defaultInclude: Record<string, unknown> | null = null;

  // Allocated once — shared across all findAll / findAllWithoutPagination calls
  // that don't supply their own additionalWhere
  static readonly _defaultWhere: Record<string, unknown> = {
    status: { not: 'DELETED' },
  };

  /* ------------------------------------------------------------------ */
  /*  Prisma delegate shortcut                                           */
  /* ------------------------------------------------------------------ */
  private static get db(): AnyDelegate {
    return getDelegate(this._modelName);
  }

  /* ------------------------------------------------------------------ */
  /*  CREATE                                                             */
  /* ------------------------------------------------------------------ */
  static async create<T>(data: Record<string, unknown>): Promise<T> {
    return this.db.create({ data }) as Promise<T>;
  }

  static async createMany(data: Record<string, unknown>[]): Promise<{ count: number }> {
    return this.db.createMany({ data }) as Promise<{ count: number }>;
  }

  static async createManySkipDuplicates(
    data: Record<string, unknown>[],
  ): Promise<{ count: number }> {
    return this.db.createMany({
      data,
      skipDuplicates: true,
    }) as Promise<{ count: number }>;
  }

  /* ------------------------------------------------------------------ */
  /*  READ                                                               */
  /* ------------------------------------------------------------------ */
  static async existsById<T>(id: string): Promise<boolean> {
    const count = await this.db.count({
      where: { id },
    });
    return count > 0;
  }

  static async exists(where: Record<string, unknown>): Promise<boolean> {
    const count = (await this.db.count({ where })) as number;
    return count > 0;
  }

  static async findById<T>(
    id: number,
    { include, additionalWhere = {} }: FindByIdOptions = {},
  ): Promise<T | null> {
    const resolvedInclude = include ?? this._defaultInclude ?? undefined;
    return this.db.findUnique({
      where: { id, ...additionalWhere },
      ...(resolvedInclude && { include: resolvedInclude }),
    }) as Promise<T | null>;
  }

  static async findOne<T>(
    where: Record<string, unknown>,
    { include, orderBy, select }: FindOneOptions = {},
  ): Promise<T | null> {
    return this.db.findFirst({
      where,
      ...(orderBy && { orderBy }),
      ...(include && { include }),
      ...(select && { select }),
    }) as Promise<T | null>;
  }

  static async findAll<T>(
    page: number,
    limit: number,
    searchParams: Record<string, unknown>,
    {
      fieldMappings,
      additionalWhere,
      include,
      select,
      orderBy = { created_at: 'desc' },
    }: FindAllOptions = {},
  ): Promise<PaginationResult<T>> {
    const { skip, take } = PaginationUtils.getSkipTake(page, limit);
    const where = this._buildWhere(
      searchParams,
      fieldMappings ?? this._fieldMappings,
      additionalWhere ?? this._defaultWhere,
    );

    const [total, records] = await Promise.all([
      this.db.count({ where }) as Promise<number>,
      this.db.findMany({
        where,
        skip,
        take,
        orderBy,
        ...(select && { select }),
        ...(include && { include }),
      }) as Promise<T[]>,
    ]);

    return PaginationUtils.getPaginationData<T>(records, total, page, limit);
  }

  /**
   * findAllMongo — like findAll but uses aggregateRaw.
   *
   * Key difference: `exact` fields are compared via `{ $expr: { $eq: [$toString, value] } }`
   * so documents stored as either a plain String or a BSON ObjectId are matched correctly,
   * avoiding the ObjectId / String type-mismatch bug that affects Prisma's typed queries.
   */
  static async findAllMongo<T>(
    page: number,
    limit: number,
    searchParams: Record<string, unknown>,
    {
      fieldMappings,
      additionalWhere = [],
      orderBy = { createdAt: -1 },
      project,
    }: FindAllMongoOptions = {},
  ): Promise<PaginationResult<T>> {
    const { skip, take } = PaginationUtils.getSkipTake(page, limit);
    const mappings = fieldMappings ?? this._fieldMappings;

    const matchConditions: Record<string, unknown>[] = [];

    for (const [type, fields] of Object.entries(mappings) as [string, string[]][]) {
      for (const field of fields) {
        const value = searchParams[field];
        if (value === undefined || value === null || value === '') continue;

        switch (type) {
          case 'exact':
            // $toString normalises both ObjectId and String storage to a plain string
            matchConditions.push({
              $expr: { $eq: [{ $toString: `$${field}` }, String(value)] },
            });
            break;
          case 'text':
            matchConditions.push({ [field]: { $regex: String(value), $options: 'i' } });
            break;
          case 'date':
            if (typeof value === 'string' && DATE_REGEX.test(value)) {
              matchConditions.push({
                [field]: {
                  $gte: { $date: `${value}T00:00:00.000Z` },
                  $lte: { $date: `${value}T23:59:59.999Z` },
                },
              });
            }
            break;
          case 'numeric':
          case 'number':
            matchConditions.push({ [field]: +Number(value) });
            break;
        }
      }
    }

    for (const cond of additionalWhere) {
      matchConditions.push(cond);
    }

    const matchStage = matchConditions.length > 0 ? { $and: matchConditions } : {};

    const dataPipeline: Record<string, unknown>[] = [
      { $match: matchStage },
      { $sort: orderBy },
      { $skip: skip },
      { $limit: take },
      ...(project
        ? [{ $project: project }]
        : (() => {
            const m = fieldMappings ?? this._fieldMappings;
            const addFields: Record<string, unknown> = { id: { $toString: '$_id' } };
            // Serialize ObjectId fields (exact) and Date fields to plain strings
            for (const field of m.exact ?? []) {
              addFields[field] = { $toString: `$${field}` };
            }
            for (const field of m.date ?? []) {
              addFields[field] = { $toString: `$${field}` };
            }
            return [{ $addFields: addFields }, { $project: { _id: 0 } }];
          })()),
    ];

    const countPipeline = [{ $match: matchStage }, { $count: 'total' }];

    const [docs, countResult] = await Promise.all([
      this.db.aggregateRaw({ pipeline: dataPipeline }),
      this.db.aggregateRaw({ pipeline: countPipeline }),
    ]);

    const total = (countResult as unknown as Array<{ total: number }>)[0]?.total ?? 0;
    return PaginationUtils.getPaginationData<T>(
      docs as unknown as T[],
      total,
      page,
      limit,
    );
  }

  static async findAllWithoutPagination<T>({
    searchParams = {},
    additionalWhere,
    orderBy,
    include,
  }: FindAllWithoutPaginationOptions = {}): Promise<T[]> {
    const where = this._buildWhere(
      searchParams,
      { exact: Object.keys(searchParams) },
      additionalWhere ?? this._defaultWhere,
    );

    return this.db.findMany({
      where,
      ...(orderBy && { orderBy }),
      ...(include && { include }),
    }) as Promise<T[]>;
  }

  /* ------------------------------------------------------------------ */
  /*  UPDATE                                                             */
  /* ------------------------------------------------------------------ */
  static async updateById<T>(id: number, data: Record<string, unknown>): Promise<T> {
    return this.db.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    }) as Promise<T>;
  }

  /* ------------------------------------------------------------------ */
  /*  DELETE                                                             */
  /* ------------------------------------------------------------------ */
  static async softDelete<T>(id: number): Promise<T> {
    return this.updateById<T>(id, { status: 'DELETED' });
  }

  static async deleteById<T>(
    id: number,
    soft = true,
    statusField = 'status',
  ): Promise<T> {
    if (soft) {
      return this.db.update({
        where: { id },
        data: { [statusField]: 'INACTIVE' },
      }) as Promise<T>;
    }
    return this.db.delete({ where: { id } }) as Promise<T>;
  }

  static async bulkDeleteByIds<T>(
    ids: number[],
    soft = true,
    statusField = 'status',
  ): Promise<T> {
    if (soft) {
      return this.db.updateMany({
        where: { id: { in: ids } },
        data: { [statusField]: 'INACTIVE' },
      }) as Promise<T>;
    }
    return this.db.deleteMany({
      where: { id: { in: ids } },
    }) as Promise<T>;
  }

  /* ------------------------------------------------------------------ */
  /*  MISC                                                               */
  /* ------------------------------------------------------------------ */
  static async toggleStatus<T>(
    id: number,
    currentStatus: string,
    statusField = 'status',
  ): Promise<T> {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return this.updateById<T>(id, { [statusField]: newStatus });
  }

  static async count(where: Record<string, unknown> = {}): Promise<number> {
    return this.db.count({ where }) as Promise<number>;
  }

  static async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }

  /* ------------------------------------------------------------------ */
  /*  Private — where-clause builder                                     */
  /* ------------------------------------------------------------------ */
  /**
   * Single-pass where-clause builder.
   *
   * Time:  O(F + A)  — F mapped fields, A additionalWhere entries
   * Space: O(F + A)  — no intermediate clones or cleanup pass
   */
  protected static _buildWhere(
    params: Record<string, unknown>,
    mappings: FieldMappings,
    additional: Record<string, unknown>,
  ): WhereClause {
    const and: Record<string, unknown>[] = [];
    let or: Record<string, unknown>[] | undefined;

    for (const [type, fields] of Object.entries(mappings) as [string, string[]][]) {
      for (const field of fields) {
        const value = params[field];
        if (value === undefined || value === null || value === '') continue;

        const clause = this._processField(field, value, type);
        if (type === 'text') {
          (or ??= []).push(clause);
        } else {
          and.push(clause);
        }
      }
    }

    for (const [key, value] of Object.entries(additional)) {
      and.push({ [key]: value });
    }

    const result: WhereClause = {};
    if (and.length) result.AND = and;
    if (or?.length) result.OR = or;
    return result;
  }

  protected static _processField(
    field: string,
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    switch (type) {
      case 'numeric':
      case 'number':
        return { [field]: +Number(value) };

      case 'date':
        if (typeof value === 'string' && DATE_REGEX.test(value)) {
          return {
            [field]: {
              gte: new Date(`${value}T00:00:00.000Z`),
              lte: new Date(`${value}T23:59:59.999Z`),
            },
          };
        }
        return { [field]: new Date(value as string) };

      case 'text':
        return {
          [field]: {
            contains: String(value),
            mode: 'insensitive',
          },
        };

      case 'exact':
      default:
        if (value === 'true') return { [field]: true };
        if (value === 'false') return { [field]: false };
        return { [field]: value };
    }
  }
}

export default BaseRepository;
