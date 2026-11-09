import {Icon} from './Icon.jsx';

export function Button({variant = 'secondary', size = 'md', label, icon, children, className = '', ...rest}) {
  return (
    <button type="button" className={`btn ${variant} ${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} />}
      {label}
      {children}
    </button>
  );
}
