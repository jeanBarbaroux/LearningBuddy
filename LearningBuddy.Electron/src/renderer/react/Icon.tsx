import { ICON_PATHS, type IconName } from '../lib/icons';

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <span aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name].map((path, index) => <path d={path} key={index} />)}
      </svg>
    </span>
  );
}