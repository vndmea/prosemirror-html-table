import { Extension } from '@tiptap/core';
import { history, redo, undo } from '@tiptap/pm/history';

export const TiptapHistoryExtension = Extension.create({
  name: 'history',

  addKeyboardShortcuts() {
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
    };
  },

  addProseMirrorPlugins() {
    return [history()];
  },
});
