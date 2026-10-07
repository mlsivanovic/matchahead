import type { ThemePreference } from '../logic/theme.ts';

export function ThemePicker(props: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  return <div className="theme-picker" role="group" aria-label="Izgled">
    {([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']] as const).map(([value, label]) =>
      <button key={value} type="button" aria-pressed={props.value === value} onClick={() => props.onChange(value)}>{label}</button>)}
  </div>;
}
