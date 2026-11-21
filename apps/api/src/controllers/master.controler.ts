import MasterService from '@/services/master.service';
import { handleDataCreation, handleDataRetrieval } from '@/utils/responsehandler/index.utils';
import type { Request, Response } from 'express';

class MasterController {
  static async createMasterTypeConstant(req: Request, res: Response): Promise<void> {
    const { type, value, info } = req.body;

    const result = await MasterService.createMasterTypeConstant({
      type,
      value,
      info,
    });

    handleDataCreation(res, result, 'Master type constant created successfully');
  }

  static async getMasterTypeConstants(req: Request, res: Response): Promise<void> {
    const { type, value, page, limit } = req.query;

    const result = await MasterService.getMasterTypeConstants({
      type,
      value,
      page,
      limit,
    } as Parameters<typeof MasterService.getMasterTypeConstants>[0]);

    handleDataRetrieval(res, result, 'Master type constants fetched successfully');
  }

  static async getMasterTypeConstantTypes(req: Request, res: Response): Promise<void> {
    const result = await MasterService.getMasterTypeConstantTypes();
    handleDataRetrieval(res, result, 'Master type constant types fetched successfully');
  }
}

export default MasterController;
