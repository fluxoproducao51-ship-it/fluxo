import {Icon} from './Icon.jsx';

export function SectionHeader({title, onSeeAll, seeAllLabel = 'Ver tudo'}) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {onSeeAll && (
        <button type="button" className="see-all" onClick={onSeeAll}>
          {seeAllLabel}
          <Icon name="chevronRight" size={16} />
        </button>
      )}
    </div>
  );
}
