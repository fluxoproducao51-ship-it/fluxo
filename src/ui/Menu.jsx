import {useEffect, useRef} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {Icon} from './Icon.jsx';

const EASE_OUT = [0.16, 1, 0.3, 1];

export function Menu({open, onClose, align = 'left', up = false, children}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = event => ref.current && !ref.current.parentElement.contains(event.target) && onClose();
    const key = event => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={`menu ${align === 'right' ? 'right' : ''} ${up ? 'up' : ''}`}
          initial={{opacity: 0, y: up ? 6 : -6, scale: 0.98}}
          animate={{opacity: 1, y: 0, scale: 1}}
          exit={{opacity: 0, y: -4, transition: {duration: 0.1, ease: 'easeIn'}}}
          transition={{duration: 0.18, ease: EASE_OUT}}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MenuItem({label, checked, onSelect}) {
  return (
    <button type="button" className={checked ? 'menu-item checked' : 'menu-item'} onClick={onSelect}>
      <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{label}</span>
      {checked && <Icon name="check" size={16} />}
    </button>
  );
}

export const MenuDivider = () => <div className="menu-div" />;
