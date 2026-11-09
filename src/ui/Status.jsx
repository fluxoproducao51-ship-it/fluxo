import {STATUS} from '../state/data.js';

export function Status({value, short}) {
  const s = STATUS[value] ?? STATUS.HISTORICO;
  return (
    <span className={s.pulse ? 'status pulse' : 'status'} style={{'--c': s.color}}>
      {short ? s.short : s.label}
    </span>
  );
}
