/* ─────────────────────────────────────────
   Category badge
───────────────────────────────────────── */
const CATEGORY_STYLES: Record<string, string> = {
    SENSOR: "bg-blue-50 text-blue-700 border border-blue-200",
    ACTUATOR: "bg-violet-50 text-violet-700 border border-violet-200",
    DEFAULT: "bg-gray-100 text-gray-600 border border-gray-200",
};

const CategoryBadge = ({ category }: { category?: string }) => {
    if (!category) return <span className="text-xs text-gray-400">—</span>;
    const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.DEFAULT;
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}
        >
            {category}
        </span>
    );
};

export default CategoryBadge;
