import React from 'react';
import KeyValueAttachmentList, { parseKeyValues } from './KeyValueAttachmentList';

export { parseKeyValues };

/**
 * Composant réutilisable pour la saisie et l'affichage des informations clés-valeurs.
 * Interopérable avec KeyValueAttachmentList.
 */
export default function KeyValueFields({
  fields,
  items,
  onChange,
  isEditing = false,
  title = "Informations & Références (Clés-Valeurs)",
  helperText,
  emptyMessage,
  className = ""
}) {
  const currentItems = fields !== undefined ? fields : items;

  return (
    <KeyValueAttachmentList
      items={currentItems}
      onChange={onChange}
      isEditing={isEditing}
      title={title}
      className={className}
    />
  );
}
