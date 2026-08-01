import { categories, categoryMeta, type Category } from '../data/tools';

interface CategoryFilterProps {
  selected: Category;
  onChange: (category: Category) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5 px-1">
      {categories.map((cat) => {
        const meta = categoryMeta[cat];
        const isActive = selected === cat;
        const isDefault = cat === '全部';
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-300 whitespace-nowrap ${
              isActive
                ? isDefault
                  ? 'bg-white/[0.08] text-text-primary border border-white/[0.1] shadow-lg shadow-white/[0.02]'
                  : 'bg-accent-blue/12 text-accent-blue border border-accent-blue/20 shadow-lg shadow-accent-blue/8'
                : 'bg-white/[0.01] text-text-secondary/70 hover:bg-white/[0.03] hover:text-text-primary hover:border-white/[0.06] border border-transparent'
            }`}
          >
            {isActive && !isDefault && (
              <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent-blue/8 via-accent-cyan/4 to-accent-purple/8 animate-shimmer" />
            )}
            <span className="relative text-sm">{meta.icon}</span>
            <span className="relative text-[12px]">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}