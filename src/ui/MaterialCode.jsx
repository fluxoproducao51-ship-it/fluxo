// Short polymer code shown where a lot needs a quick visual identifier.
const CODES = [
  [/ELETRONICO|PLACA|RELOGIO/, 'ELE'],
  [/BORRA/, 'BOR'],
  [/VARREDURA/, 'VAR'],
  [/EVA/, 'EVA'],
  [/\bABS\b/, 'ABS'],
  [/HIPS/, 'HIPS'],
  [/\bPC\b/, 'PC'],
  [/ACRILICO/, 'ACR'],
  [/\bPS\b/, 'PS'],
  [/\bPP\b|POLIPROPILENO/, 'PP'],
  [/\bPET\b/, 'PET'],
  [/\bPE\b|PEABD|PEBD|XLPE/, 'PE']
];

export function materialCode(material = '') {
  const text = material.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return CODES.find(([pattern]) => pattern.test(text))?.[1] ?? 'MIX';
}

export function MaterialCode({material}) {
  return (
    <span className="mat-code" title={material}>
      {materialCode(material)}
    </span>
  );
}
