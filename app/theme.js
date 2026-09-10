// TrainingPeaks-inspired design system: dark navy header, clean card-based calendar.
export const colors = {
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F6',
  border: '#E2E6ED',
  text: '#101828',
  textMuted: '#667085',
  textInverse: '#FFFFFF',
  primary: '#0B3D91',
  primaryDark: '#082B66',
  primaryLight: '#E8EFFC',
  accent: '#2563EB',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  today: '#0B3D91',
};

// Workout type -> color, mirrors TrainingPeaks' colored workout chips.
export const workoutTypeColors = {
  forza: '#2563EB',
  endurance: '#16A34A',
  mobilita: '#9333EA',
  test: '#F59E0B',
  riposo: '#9CA3AF',
  dieta: '#DB2777',
  scheda: '#7C3AED',
  pagamento: '#EA580C',
  funzionale: '#0D9488',
};

export const statusColors = {
  pianificato: colors.textMuted,
  completato: colors.success,
  saltato: colors.danger,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, fontWeight: '400', color: colors.text },
  caption: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
};

export default { colors, workoutTypeColors, statusColors, spacing, radius, typography };
