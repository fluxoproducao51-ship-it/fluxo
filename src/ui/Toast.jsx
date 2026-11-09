import {useEffect} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useStore} from '../state/store.jsx';
import {Icon} from './Icon.jsx';

const DURATION = 5000;

export function Toast() {
  const {toast, dismissToast} = useStore();
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(dismissToast, DURATION);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.key}
          className="toast"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.12}}
          onClick={dismissToast}
        >
          <div style={{flex: 1, minWidth: 0}}>
            <div className="toast-status">
              <Icon name={toast.icon ?? 'check'} size={14} />
              {toast.status}
            </div>
            <div className="toast-title">{toast.title}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
