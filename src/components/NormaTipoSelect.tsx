import React from 'react';
import { NormaTipo } from '../types/norma';
import { NORMA_SPECIES_GROUPS, getNormaSpec } from '../utils/normaProfiles';

interface NormaTipoSelectProps {
  value: NormaTipo;
  onChange: (tipo: NormaTipo) => void;
  id?: string;
  className?: string;
}

export const NormaTipoSelect: React.FC<NormaTipoSelectProps> = ({
  value,
  onChange,
  id,
  className = 'w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900',
}) => {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as NormaTipo)}
      className={className}
    >
      {NORMA_SPECIES_GROUPS.map((group) => (
        <optgroup key={group.id} label={group.label}>
          {group.tipos.map((tipo) => {
            const spec = getNormaSpec(tipo);
            const label = spec.siglaCurta ? `${tipo} (${spec.siglaCurta})` : tipo;
            return (
              <option key={tipo} value={tipo}>
                {label}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
};
