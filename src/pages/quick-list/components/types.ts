import { z } from 'zod';

export const shortcutFormSchema = z
  .object({
    type: z.enum(['note', 'exact']),
    note: z.string().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
  })
  .refine(
    (data) => {
      // At least one field must be filled
      const hasNote = !!data.note && data.note.trim().length > 0;
      const hasPrice = !!data.price && (typeof data.price === 'number' ? data.price > 0 : Number(data.price) > 0);
      return hasNote || hasPrice;
    },
    {
      message: '请至少填写价格备注或 HR 价格中的一项。',
      path: ['note'],
    },
  );

export type ShortcutFormData = z.infer<typeof shortcutFormSchema>;

export const priceTypeOptions = [
  { value: 'exact', label: '固定价格' },
  { value: 'note', label: '价格备注' },
] as const;
