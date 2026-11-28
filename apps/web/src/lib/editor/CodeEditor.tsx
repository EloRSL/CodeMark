import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { python } from '@codemirror/lang-python';
import { autocompletion } from '@codemirror/autocomplete';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  autocomplete: boolean;
  highlightLines?: number[];
}

const readOnlyConfig = new Compartment();
const autocompleteConfig = new Compartment();
const highlightConfig = new Compartment();
const externalUpdate = Annotation.define<boolean>();

function readOnlyExtension(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function autocompleteExtension(enabled: boolean) {
  return enabled
    ? []
    : autocompletion({
        activateOnTyping: false,
        override: [],
      });
}

function highlightExtension(lines: number[]) {
  return EditorView.decorations.of((view) => {
    const validLines = [...new Set(lines)]
      .filter((line) => Number.isInteger(line) && line >= 1 && line <= view.state.doc.lines)
      .sort((a, b) => a - b);

    return Decoration.set(
      validLines.map((line) =>
        Decoration.line({
          class: 'cm-highlighted-code-line',
        }).range(view.state.doc.line(line).from),
      ),
    );
  });
}

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '200px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'monospace',
  },
  '.cm-content': {
    minHeight: '200px',
  },
  '.cm-highlighted-code-line': {
    backgroundColor: 'rgba(234, 179, 8, 0.20)',
  },
});

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  autocomplete,
  highlightLines,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: '',
        extensions: [
          basicSetup,
          python(),
          editorTheme,
          readOnlyConfig.of(readOnlyExtension(false)),
          autocompleteConfig.of(autocompleteExtension(false)),
          highlightConfig.of(highlightExtension([])),
          EditorView.updateListener.of((update) => {
            const isExternal = update.transactions.some(
              (transaction) => transaction.annotation(externalUpdate) === true,
            );

            if (update.docChanged && !isExternal) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const nextValue = value.replace(/\r\n?/g, '\n');

    if (view.state.doc.toString() !== nextValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextValue,
        },
        annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)],
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyConfig.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: autocompleteConfig.reconfigure(autocompleteExtension(autocomplete && !readOnly)),
    });
  }, [autocomplete, readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightConfig.reconfigure(highlightExtension(highlightLines ?? [])),
    });
  }, [highlightLines]);

  return <div ref={containerRef} />;
}
