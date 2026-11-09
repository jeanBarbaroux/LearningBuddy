import { Fragment } from 'react';
import { linkify } from '../../core/text';
import { api } from './api';
import { alertDialog } from './dialogs';
import { errorMessage, t } from './i18n';

/** Paragraph displaying `value` with clickable links, optionally preceded by a plain prefix. */
export function linkedText(value: string, className = 'pre-line', prefix?: string) {
  return (
    <p className={className}>
      {prefix && <strong>{prefix}</strong>}
      {linkify(value).map((segment, index) => {
        if (!segment.url) {
          return <Fragment key={index}>{segment.text}</Fragment>;
        }

        const url = segment.url;
        return (
          <a key={index} href="#" title={url} onClick={(event) => {
            event.preventDefault();
            api.app.openExternal(url).catch((error: unknown) => void alertDialog(t('ApplicationTitle'), errorMessage(error), 'error'));
          }}>
            {segment.text}
          </a>
        );
      })}
    </p>
  );
}