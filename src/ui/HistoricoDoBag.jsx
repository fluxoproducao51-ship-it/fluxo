import {useStore} from '../state/store.jsx';
import {date, hours, kg, nomeVolume, title} from '../state/data.js';
import {tempoNaMaquina} from '../state/bags.js';
import {Icon} from './Icon.jsx';

const quando = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
};

// Where one bag is now, as a short sentence.
export function situacaoDoBag(bag) {
  if (!bag) return '';
  if (bag.status === 'maquina') return `Na ${title(bag.setor)} desde ${quando(bag.entradaMaquina)}`;
  if (bag.status === 'fila') return bag.setor ? `Aguardando ${title(bag.setor)}` : 'Aguardando rota do PCP';
  if (bag.status === 'estoque') return 'Em estoque';
  if (bag.status === 'separado') return 'Separado em lotes filhos';
  if (bag.status === 'devolvido') return 'Devolvido ao cliente';
  return '';
}

// The whole life of one bag: received, every machine it went through, and where it is now.
export function HistoricoDoBag({lote: id, i}) {
  const {loteDe, balancoDe, apontamentos} = useStore();
  const lote = loteDe(id);
  const b = balancoDe(id);
  if (!lote) return <p className="page-sub">Lote não encontrado.</p>;
  const nome = nomeVolume(lote.embalagem);
  const bag = b?.bags.find(x => x.i === i);
  const pesoInicial = lote.bags[i];
  if (!bag) {
    return (
      <div className="hist-bag">
        <p className="label">Lote {id}</p>
        <h3 className="hist-bag-titulo">
          {nome} {i + 1} · {kg(pesoInicial)}
        </h3>
        <p className="page-sub">
          Este lote começou a ser produzido antes da produção por bag: o histórico dele é por peso, no Mapa do lote.
        </p>
      </div>
    );
  }
  const etapas = bag.rota;
  return (
    <div className="hist-bag">
      <p className="label">
        Lote {id} · {title(lote.cliente)}
      </p>
      <h3 className="hist-bag-titulo">
        {nome} {bag.n} · {title(bag.material)}
      </h3>
      <div className={`hist-bag-agora ${bag.status}`}>
        <b>{situacaoDoBag(bag)}</b>
        <span>Peso atual {kg(bag.peso)}</span>
      </div>

      {etapas.length > 0 && (
        <div className="rota-strip hist-bag-rota">
          {etapas.map((setor, k) => {
            const estado = k < bag.etapa ? 'done' : k === bag.etapa && ['fila', 'maquina'].includes(bag.status) ? 'now' : '';
            return (
              <div key={k} className={`rota-chip ${estado}`}>
                <span className="rota-n">{estado === 'done' ? <Icon name="check" size={11} stroke={3} /> : k + 1}</span>
                <span>{title(setor)}</span>
              </div>
            );
          })}
          <div className={`rota-chip ${bag.status === 'estoque' ? 'now' : ''}`}>
            <span className="rota-n">
              <Icon name="truck" size={11} />
            </span>
            <span>Estoque</span>
          </div>
        </div>
      )}

      <ol className="hist-bag-linha">
        <li>
          <span className="hist-bag-ponto" />
          <div>
            <b>Recebido</b>
            <span>
              {date(lote.data, true)} · {kg(pesoInicial)} · conferente {title(lote.conferente) || '—'}
              {lote.nf ? ` · NF ${lote.nf}` : ''}
            </span>
          </div>
        </li>
        {bag.hist.map((p, k) => {
          const ap = apontamentos.find(a => a.id === p.apontamento);
          const perdeu = p.pesoSaida != null ? p.pesoEntrada - p.pesoSaida : null;
          return (
            <li key={k}>
              <span className="hist-bag-ponto feito" />
              <div>
                <b>{title(p.setor)}</b>
                <span>
                  Entrou {quando(p.entrada)} · saiu {quando(p.saida)} · {hours(tempoNaMaquina(p.entrada, p.saida, p.pausas))} na máquina
                </span>
                <span>
                  {kg(p.pesoEntrada)} → {p.pesoSaida != null ? kg(p.pesoSaida) : 'separado'}
                  {perdeu > 0 ? ` · quebra ${kg(perdeu)}` : ''}
                </span>
                <span>
                  Colocado por {title(p.operador) || '—'}
                  {p.operadorProcesso && p.operadorProcesso !== p.operador ? ` · processo de ${title(p.operadorProcesso)}` : ''}
                </span>
                {p.destino === 'separado' && ap?.separacao?.length > 0 && <span>Virou {ap.separacao.map(s => `${s.lote} (${kg(s.peso)})`).join(', ')}</span>}
              </div>
            </li>
          );
        })}
        {bag.status === 'maquina' && (
          <li>
            <span className="hist-bag-ponto agora" />
            <div>
              <b>{title(bag.setor)} · agora</b>
              <span>
                Entrou {quando(bag.entradaMaquina)} · {hours(tempoNaMaquina(bag.entradaMaquina, null, bag.proc?.pausas ?? []))} até agora · colocado por{' '}
                {title(bag.operadorEntrada) || '—'}
              </span>
            </div>
          </li>
        )}
        {bag.status === 'devolvido' && bag.devolucao && (
          <li>
            <span className="hist-bag-ponto devolvido" />
            <div>
              <b>Devolvido ao cliente</b>
              <span>
                {date(bag.devolucao.data, true)} · {title(bag.devolucao.motivo) || 'sem motivo'} · {title(bag.devolucao.responsavel) || '—'}
                {bag.devolucao.nf ? ` · NF ${bag.devolucao.nf}` : ''}
              </span>
            </div>
          </li>
        )}
        {bag.status === 'estoque' && (
          <li>
            <span className="hist-bag-ponto feito" />
            <div>
              <b>Em estoque</b>
              <span>{kg(bag.peso)} prontos</span>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
