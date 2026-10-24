import reference from './pd2-item-translations.data.json';
import supplements from './pd2-item-supplements.data.json';

/** Reference corrected simplified names retain precedence over PD2 supplements. */
export const PD2_ITEM_TRANSLATIONS = {
  ...reference,
  Unique: { ...supplements.Unique, ...reference.Unique },
  Base: { ...supplements.Base, ...reference.Base },
};
