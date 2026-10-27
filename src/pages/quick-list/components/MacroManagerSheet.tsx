import { useUiText } from '@/lib/ui-language';
import React, { useState } from 'react';
import { useOptions } from '@/hooks/useOptions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, ChevronUp, ChevronDown, Pencil, Check, NotebookPen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeInUp, listItem, listStagger, springSnappy } from '@/lib/motion';

export interface NoteMacro {
  label: string;
  text: string;
}

export function isValidMacro(m: unknown): m is NoteMacro {
  return typeof m === 'object' && m !== null && 'label' in m && 'text' in m;
}

const RESERVED_VARS = new Set(['itemName']);

/** Extract named placeholders from macro text, e.g. {sockets}, {res}, {1} — excludes {itemName} */
export function getPlaceholders(text: string): string[] {
  const matches = text.match(/\{([^}]+)}/g);
  if (!matches) return [];
  const names = [...new Set(matches.map((m) => m.slice(1, -1)))].filter((n) => !RESERVED_VARS.has(n));
  return names;
}

export function applyMacroTemplate(
  text: string,
  itemName?: string,
  placeholderValues?: Record<string, string>,
): string {
  let result = text;
  if (itemName) result = result.replace(/\{itemName}/g, itemName);
  if (placeholderValues) {
    for (const [name, value] of Object.entries(placeholderValues)) {
      result = result.replace(new RegExp(`\\{${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}}`, 'g'), value);
    }
  }
  return result;
}

const tokenClass = 'rounded bg-primary/12 px-1 py-px font-mono text-[0.95em] text-primary';
const macroAction =
  'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,background-color,transform] duration-(--dur-fast) hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 motion-safe:active:scale-90 disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5';

/** Renders macro text with `{placeholders}` highlighted as tokens. */
export const MacroTemplate: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span className={cn('break-words', className)}>
    {text.split(/(\{[^}]+})/g).map((part, i) =>
      /^\{[^}]+}$/.test(part) ? (
        <code key={i}
          className={tokenClass}>
          {part}
        </code>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </span>
);

interface MacroManagerSheetProps {
  onApply?: (macro: NoteMacro) => void;
}

const MacroManagerSheet: React.FC<MacroManagerSheetProps> = ({ onApply }) => {
  const __ui = useUiText();
  const { settings, updateSettings } = useOptions();
  const macros = (settings?.listingNoteMacros ?? []).filter(isValidMacro);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saveMacros = async (updated: NoteMacro[]) => {
    await updateSettings({ listingNoteMacros: updated });
  };

  const addMacro = async () => {
    const label = newLabel.trim();
    const text = newText.trim();
    if (!label || !text) return;
    if (macros.some((m) => m.label === label)) {
      setError(`已存在名为“${label}”的宏。`);
      return;
    }
    setError(null);
    await saveMacros([...macros, { label, text }]);
    setNewLabel('');
    setNewText('');
  };

  const removeMacro = async (index: number) => {
    await saveMacros(macros.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...macros];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    await saveMacros(updated);
    if (editingIndex === index) setEditingIndex(index - 1);
  };

  const moveDown = async (index: number) => {
    if (index === macros.length - 1) return;
    const updated = [...macros];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    await saveMacros(updated);
    if (editingIndex === index) setEditingIndex(index + 1);
  };

  const startEdit = (index: number) => {
    const macro = macros[index];
    setEditingIndex(index);
    setEditLabel(macro.label);
    setEditText(macro.text);
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;
    const label = editLabel.trim();
    const text = editText.trim();
    if (!label || !text) return;
    const updated = [...macros];
    updated[editingIndex] = { label, text };
    await saveMacros(updated);
    setEditingIndex(null);
  };

  // Stable keys so reordering animates the moved rows (labels are unique on add; suffix guards edits).
  const seen = new Map<string, number>();
  const macroKeys = macros.map((m) => {
    const base = `${m.label}\u0000${m.text}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}\u0000${n}`;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      {macros.length > 0 ? (
        <motion.ul className="space-y-1.5"
          variants={listStagger}
          initial="hidden"
          animate="visible">
          <AnimatePresence initial={false}>
            {macros.map((macro, index) => (
              <motion.li
                layout
                variants={listItem}
                exit="exit"
                transition={springSnappy}
                key={macroKeys[index]}
                className="group/macro flex items-center gap-1 rounded-lg border border-border/70 bg-secondary/60 text-sm text-secondary-foreground transition-colors duration-(--dur-fast) hover:border-ring/40 hover:bg-secondary"
              >
                {editingIndex === index ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="h-7 text-xs"
                      placeholder={__ui("模板名称")}
                      aria-label={__ui("模板名称")}
                      autoFocus
                    />
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="h-7 text-xs"
                      placeholder={__ui("例如：出售 {itemName}（{sockets} 孔）")}
                      aria-label={__ui("模板内容")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveEdit();
                        }
                      }}
                    />
                    <div className="flex gap-1">
                      <Button type="button"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={saveEdit}>
                        <Check className="size-3.5" /> {" " + __ui("保存") + " "}</Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditingIndex(null)}
                      >
                        {" " + __ui("取消") + " "}</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer rounded-l-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    onClick={() => onApply?.(macro)}
                    title={__ui("使用此模板")}
                  >
                    <span className="font-semibold">{macro.label}</span>
                    <span className="mx-1.5 text-muted-foreground">&rarr;</span>
                    <MacroTemplate text={macro.text}
                      className="text-xs text-muted-foreground" />
                  </button>
                )}
                {editingIndex !== index && (
                  <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-70 transition-opacity duration-(--dur-fast) group-hover/macro:opacity-100 group-focus-within/macro:opacity-100">
                    <button
                      type="button"
                      onClick={() => moveUp(index)}
                      className={macroAction}
                      disabled={index === 0}
                      aria-label={`将 ${macro.label} 上移`}
                      title={__ui("上移")}
                    >
                      <ChevronUp />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(index)}
                      className={macroAction}
                      disabled={index === macros.length - 1}
                      aria-label={`将 ${macro.label} 下移`}
                      title={__ui("下移")}
                    >
                      <ChevronDown />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(index)}
                      className={macroAction}
                      aria-label={`编辑 ${macro.label}`}
                      title={__ui("编辑")}
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMacro(index)}
                      className={cn(macroAction, 'hover:bg-destructive/15 hover:text-destructive')}
                      aria-label={`删除 ${macro.label}`}
                      title={__ui("删除")}
                    >
                      <X />
                    </button>
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <NotebookPen className="size-4" />
          </span>
          <p className="text-sm text-muted-foreground">{"" + __ui("暂无备注模板，可在下方添加。") + ""}</p>
        </motion.div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{"" + __ui("新建模板") + ""}</span>
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Input
          placeholder={__ui("模板名称")}
          aria-label={__ui("模板名称")}
          value={newLabel}
          onChange={(e) => {
            setNewLabel(e.target.value);
            setError(null);
          }}
        />
        <Input
          placeholder={__ui("例如：出售 {itemName}（{sockets} 孔）")}
          aria-label={__ui("模板内容")}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addMacro();
            }
          }}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <code className={tokenClass}>{'{itemName}'}</code> {" " + __ui("会自动填入物品名称；其他格式如") + ""}{' '}
          <code className={tokenClass}>{'{name}'}</code> {" " + __ui("会在使用时提示填写。") + " "}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMacro}
          disabled={!newLabel.trim() || !newText.trim()}
        >
          <Plus className="size-4" />
          {" " + __ui("添加模板") + " "}</Button>
      </div>
    </div>
  );
};

export default MacroManagerSheet;
