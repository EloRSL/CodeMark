// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from './CodeEditor';

afterEach(cleanup);

function getEditor(container: HTMLElement): EditorView {
  const element = container.querySelector<HTMLElement>('.cm-editor');

  if (!element) {
    throw new Error('Code editor is missing');
  }

  const view = EditorView.findFromDOM(element);

  if (!view) {
    throw new Error('Editor view is missing');
  }

  return view;
}

describe('CodeEditor', () => {
  it('displays Python code and line numbers', () => {
    const { container } = render(
      <CodeEditor value={'print("Hello")\nprint("World")'} autocomplete={true} />,
    );

    const view = getEditor(container);

    expect(view.state.doc.toString()).toBe('print("Hello")\nprint("World")');

    expect(container.querySelector('.cm-lineNumbers')).not.toBeNull();
  });

  it('notifies the parent when code changes', () => {
    const onChange = vi.fn();

    const { container } = render(<CodeEditor value="" onChange={onChange} autocomplete={true} />);

    const view = getEditor(container);

    act(() => {
      view.dispatch({
        changes: {
          from: 0,
          insert: 'print("Hello")',
        },
      });
    });

    expect(onChange).toHaveBeenCalledWith('print("Hello")');
  });

  it('updates external code without calling onChange', () => {
    const onChange = vi.fn();

    const { container, rerender } = render(
      <CodeEditor value="x = 1" onChange={onChange} autocomplete={false} />,
    );

    rerender(<CodeEditor value="x = 2" onChange={onChange} autocomplete={false} />);

    expect(getEditor(container).state.doc.toString()).toBe('x = 2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports read-only mode', () => {
    const { container, rerender } = render(
      <CodeEditor value="print(42)" readOnly={true} autocomplete={false} />,
    );

    const view = getEditor(container);

    expect(view.state.facet(EditorState.readOnly)).toBe(true);
    expect(view.state.facet(EditorView.editable)).toBe(false);

    rerender(<CodeEditor value="print(42)" readOnly={false} autocomplete={false} />);

    expect(view.state.facet(EditorState.readOnly)).toBe(false);
    expect(view.state.facet(EditorView.editable)).toBe(true);
  });

  it('highlights selected lines', () => {
    const { container } = render(
      <CodeEditor
        value={'x = 1\nx = 2\nprint(x)'}
        autocomplete={false}
        readOnly={true}
        highlightLines={[2]}
      />,
    );

    const highlighted = container.querySelectorAll('.cm-highlighted-code-line');

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.textContent).toBe('x = 2');
  });
});
