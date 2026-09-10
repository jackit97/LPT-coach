import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '../theme';

function dateFromValue(value) {
  if (!value) return new Date();
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function valueFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DateField({ value, onChange, placeholder = 'Seleziona data', style }) {
  const [open, setOpen] = useState(false);
  const date = dateFromValue(value);
  const handleChange = (_event, selectedDate) => {
    if (Platform.OS !== 'web') setOpen(false);
    if (selectedDate) onChange(valueFromDate(selectedDate));
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webField, style]}>
        <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)} style={styles.webPicker} />
      </View>
    );
  }

  return (
    <View style={style}>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
      </Pressable>
      {open && <DateTimePicker value={date} mode="date" display="calendar" onChange={handleChange} />}
    </View>
  );
}

const styles = {
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  value: { ...typography.body },
  placeholder: { ...typography.body, color: colors.textMuted },
  webField: { minHeight: 42, minWidth: 0, width: '100%', justifyContent: 'center', overflow: 'hidden' },
  webPicker: { boxSizing: 'border-box', display: 'block', height: 42, width: '100%', maxWidth: '100%', minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `0 ${spacing.md}px`, backgroundColor: colors.surface, color: colors.text, fontSize: 14 },
};
