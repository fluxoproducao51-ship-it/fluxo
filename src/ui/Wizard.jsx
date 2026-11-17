import {AnimatePresence, motion} from 'framer-motion';
import {Button} from './Button.jsx';
import {Icon} from './Icon.jsx';

export const EASE_OUT = [0.16, 1, 0.3, 1];


export function Passos({passos, atual}) {
  return (
    <div className="wiz-steps">
      {passos.map((p, i) => (
        <div key={p} className={`wiz-step ${i < atual ? 'done' : ''} ${i === atual ? 'now' : ''}`}>
          <span className="wiz-dot">{i < atual ? <Icon name="check" size={12} stroke={3} /> : i + 1}</span>
          <span className="wiz-label">{p}</span>
        </div>
      ))}
      <div className="wiz-bar">
        <motion.div animate={{width: `${(atual / (passos.length - 1)) * 100}%`}} transition={{duration: 0.4, ease: EASE_OUT}} />
      </div>
    </div>
  );
}

export function Corpo({passo, children}) {
  return (
    <motion.div
      key={passo}
      className="wiz-body"
      initial={{opacity: 0, x: 24}}
      animate={{opacity: 1, x: 0}}
      transition={{duration: 0.3, ease: EASE_OUT}}
    >
      {children}
    </motion.div>
  );
}

export function Rodape({passo, onVoltar, onAvancar, avancarLabel = 'Avançar', erro, final}) {
  return (
    <div className="wiz-foot">
      {passo > 0 ? <Button variant="secondary" size="lg" label="← Voltar" onClick={onVoltar} /> : <span />}
      <div style={{display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
        <AnimatePresence>
          {erro && (
            <motion.span key={erro} className="wiz-err" initial={{opacity: 0, x: 8}} animate={{opacity: 1, x: 0}}>
              {erro}
            </motion.span>
          )}
        </AnimatePresence>
        {onAvancar && (
          <Button variant="primary" size="lg" icon={final ? 'check' : 'arrowRight'} label={avancarLabel} onClick={onAvancar} />
        )}
      </div>
    </div>
  );
}

