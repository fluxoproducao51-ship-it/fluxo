import {useState} from 'react';
import {useStore} from '../state/store.jsx';
import {bagsMisturados, date, kg, materialDoBag, nomeVolume, title} from '../state/data.js';
import {podeDevolverBag} from '../state/balance.js';
import {pode} from '../state/perfis.js';
import {Button} from './Button.jsx';
import {Icon} from './Icon.jsx';
import {situacaoDoBag} from './HistoricoDoBag.jsx';

// The weighed bags of a received lot, each with its weight; whole bags can go back to the customer
// while the lot hasn't started its first step, and a return made by mistake can be undone.
export function BagsDoLote({lote}) {
  const {balancoDe, devolucoes, openDialog, desfazerDevolucao, notify, perfil} = useStore();
  const [desfazendo, setDesfazendo] = useState(null);
  const b = balancoDe(lote.lote);
  if (!lote.bags.length || !b) return null;
  const nome = nomeVolume(lote.embalagem);
  const nomes = n => nomeVolume(lote.embalagem, n).toLowerCase();
  const devolvidos = new Map(devolucoes.filter(d => d.lote === lote.lote).map(d => [d.bag, d]));
  const devolve = pode(perfil, 'devolver') && !lote.origem;
  const pesoDevolvido = [...devolvidos.values()].reduce((s, d) => s + d.peso, 0);
  const total = lote.bags.reduce((s, p) => s + p, 0);
  const restantes = lote.bags.length - devolvidos.size;
  const misturado = bagsMisturados(lote);
  return (
    <>
      <div className="lote-volumes-resumo">
        <span>
          Total <b>{kg(total)}</b>
        </span>
        <span>
          Média <b>{kg(Math.round(total / lote.bags.length))}</b>
        </span>
        {lote.bags.length > 1 && (
          <span>
            Menor <b>{kg(Math.min(...lote.bags))}</b> · Maior <b>{kg(Math.max(...lote.bags))}</b>
          </span>
        )}
      </div>
      {devolvidos.size > 0 && (
        <div className="bags-devolvidos-resumo">
          {devolvidos.size} {nomes(devolvidos.size)} {devolvidos.size === 1 ? 'devolvido' : 'devolvidos'} · <b>{kg(pesoDevolvido)}</b>
          {restantes > 0 && (
            <>
              {' '}
              · seguem {restantes} {nomes(restantes)} · <b>{kg(total - pesoDevolvido)}</b>
            </>
          )}
        </div>
      )}
      <div className="lote-volumes">
        {lote.bags.map((peso, i) => {
          const d = devolvidos.get(i);
          const estado = b.porBag ? b.bags.find(x => x.i === i) : null;
          const livre = podeDevolverBag(lote, b, peso, i);
          return (
            <div key={i} className={`lote-volume ${d ? 'devolvido' : ''} ${estado ? `bag-${estado.status}` : ''}`}>
              <button type="button" className="bag-abrir" onClick={() => openDialog({tipo: 'bag', lote: lote.lote, bag: i})} title="Ver histórico do bag">
                {nome} {i + 1}
                <Icon name="chevronRight" size={12} />
              </button>
              <b>{kg(estado && estado.status !== 'devolvido' ? estado.peso : peso)}</b>
              {estado && !d && <small className="bag-situacao">{situacaoDoBag(estado)}</small>}
              <small className={`bag-material ${misturado ? 'destaque' : ''}`}>{title(materialDoBag(lote, i)) || '—'}</small>
              {d ? (
                <>
                  <small className="bag-motivo" title={[d.motivo && title(d.motivo), d.nf && `NF ${d.nf}`, d.obs].filter(Boolean).join(' · ')}>
                    Devolvido {date(d.data)}
                    {d.motivo ? ` · ${title(d.motivo)}` : ''}
                  </small>
                  {devolve &&
                    (desfazendo === d.id ? (
                      <span className="bag-acoes">
                        <Button
                          size="sm"
                          variant="primary"
                          label="Sim, desfazer"
                          onClick={() => {
                            desfazerDevolucao(d.id);
                            setDesfazendo(null);
                            notify({status: 'Devolução desfeita', title: `Lote ${lote.lote} · ${nome} ${i + 1}`, detail: `${kg(peso)} voltaram para o lote`, icon: 'refresh'});
                          }}
                        />
                        <Button size="sm" label="Não" onClick={() => setDesfazendo(null)} />
                      </span>
                    ) : (
                      <button type="button" className="bag-link" onClick={() => setDesfazendo(d.id)}>
                        Desfazer devolução
                      </button>
                    ))}
                </>
              ) : (
                devolve && (
                  <button
                    type="button"
                    className="bag-link"
                    disabled={!livre}
                    title={livre ? `Devolver ${nome.toLowerCase()} ${i + 1} ao cliente` : 'O material já entrou em produção'}
                    onClick={() => openDialog({tipo: 'devolucao', lote: lote.lote, bag: i})}
                  >
                    Devolver
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
      {devolve && restantes > 0 && !lote.bags.some((p, i) => !devolvidos.has(i) && podeDevolverBag(lote, b, p, i)) && (
        <p className="wiz-note">O material já entrou em produção: não dá mais para devolver {nomes(2)} deste lote.</p>
      )}
    </>
  );
}
