import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from './i18n';

export interface DialogHandle {
  close(): void;
}

export interface DialogOptions {
  readonly title: string;
  readonly size?: 'narrow' | 'normal' | 'wide';
  readonly onClose?: () => void;
}

/** Mounts a React view in the native modal dialog of the main window. */
export function openDialog(options: DialogOptions, render: (handle: DialogHandle) => ReactNode): DialogHandle {
  let element: HTMLDialogElement | null = null;
  let closed = false;
  const handle: DialogHandle = { close: () => element?.close() };
  const content = render(handle);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onClose = (): void => {
    if (closed) {
      return;
    }

    closed = true;
    try {
      options.onClose?.();
    } finally {
      root.unmount();
      host.remove();
    }
  };

  document.body.append(host);
  root.render(<DialogFrame options={options} content={content} onClose={onClose} onReady={(dialog) => { element = dialog; }} />);
  return handle;
}

function DialogFrame({ options, content, onClose, onReady }: {
  readonly options: DialogOptions;
  readonly content: ReactNode;
  readonly onClose: () => void;
  readonly onReady: (dialog: HTMLDialogElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }

    element.addEventListener('close', onClose);
    onReady(element);
    element.showModal();
    return () => {
      element.removeEventListener('close', onClose);
      if (element.open) {
        element.close();
      }
    };
  }, [onClose, onReady]);

  const preventSubmit = (event: FormEvent<HTMLFormElement>): void => event.preventDefault();
  return (
    <dialog ref={dialog} className={options.size === 'narrow' || options.size === 'wide' ? options.size : undefined} aria-label={options.title}>
      <form method="dialog" onSubmit={preventSubmit}>
        <div className="dialog-header"><h2>{options.title}</h2></div>
        {content}
      </form>
    </dialog>
  );
}

/** Asks a yes/no question; resolves to true when confirmed. */
export function confirmDialog(title: string, text: string, confirmLabel = t('Delete')): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    openDialog({ title, size: 'narrow', onClose: () => resolve(confirmed) }, (handle) => (
      <>
        <div className="dialog-body"><p className="pre-line">{text}</p></div>
        <div className="dialog-footer">
          <button type="button" onClick={handle.close}>{t('Cancel')}</button>
          <button type="button" className="danger" autoFocus onClick={() => { confirmed = true; handle.close(); }}>{confirmLabel}</button>
        </div>
      </>
    ));
  });
}

/** Shows an information or error message. */
export function alertDialog(title: string, text: string, kind: 'info' | 'error' | 'success' = 'info'): Promise<void> {
  return new Promise((resolve) => {
    openDialog({ title, size: 'narrow', onClose: resolve }, (handle) => (
      <>
        <div className="dialog-body"><p className={`message ${kind === 'info' ? '' : kind} pre-line`}>{text}</p></div>
        <div className="dialog-footer">
          <button type="button" className="primary" autoFocus onClick={handle.close}>{t('Close')}</button>
        </div>
      </>
    ));
  });
}