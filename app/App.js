import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Pressable, Text, TextInput, Platform, useWindowDimensions } from 'react-native';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AthleteProvider } from './context/AthleteContext';
import { colors } from './theme';

// Avoid white-on-white inputs: some Android/Chrome auto-dark modes invert unstyled text fields.
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.placeholderTextColor = colors.textMuted;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const meta = document.createElement('meta');
  meta.name = 'color-scheme';
  meta.content = 'light';
  document.head.appendChild(meta);
  document.documentElement.style.colorScheme = 'light';
}

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import CalendarScreen from './screens/CalendarScreen';
import DayWorkoutsScreen from './screens/DayWorkoutsScreen';
import WorkoutDetailScreen from './screens/WorkoutDetailScreen';
import WorkoutEditorScreen from './screens/WorkoutEditorScreen';
import ClientsScreen from './screens/ClientsScreen';
import ProfileScreen from './screens/ProfileScreen';
import DietsScreen from './screens/DietsScreen';
import DietDetailScreen from './screens/DietDetailScreen';
import DietEditorScreen from './screens/DietEditorScreen';
import PaymentsScreen from './screens/PaymentsScreen';
import EnduranceScreen from './screens/EnduranceScreen';
import EndurancePlanDetailScreen from './screens/EndurancePlanDetailScreen';
import EnduranceWorkoutEditorScreen from './screens/EnduranceWorkoutEditorScreen';
import FunctionalWorkoutEditorScreen from './screens/FunctionalWorkoutEditorScreen';
import VideosScreen from './screens/VideosScreen';
import NewActivityScreen from './screens/NewActivityScreen';
import StrengthScreen from './screens/StrengthScreen';
import StrengthSheetDetailScreen from './screens/StrengthSheetDetailScreen';
import StrengthSheetEditorScreen from './screens/StrengthSheetEditorScreen';
import TemplatesScreen from './screens/TemplatesScreen';
import TemplateDetailScreen from './screens/TemplateDetailScreen';
import ZonesScreen from './screens/ZonesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function BackButton({ navigation }) {
  if (!navigation.canGoBack()) return null;
  return (
    <Pressable onPress={() => navigation.goBack()} style={{ paddingRight: 10, paddingVertical: 8, minWidth: 28 }}>
      <Text style={{ color: colors.textInverse, fontSize: 14, fontWeight: '700' }}>‹</Text>
    </Pressable>
  );
}

const screenOptions = ({ navigation }) => ({
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: '700' },
  headerTitleAlign: 'left',
  headerRight: () => <ProfileButton navigation={navigation} />,
  headerLeft: () => <BackButton navigation={navigation} />,
});

function ProfileButton({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Profile')} style={{ paddingHorizontal: 8 }}>
      <Text style={{ color: colors.textInverse, fontWeight: '700' }}>Profilo</Text>
    </Pressable>
  );
}

const tabOptions = (fullLabel, shortLabel, icon, compact) => ({
  title: fullLabel,
  tabBarLabel: compact ? shortLabel : fullLabel,
  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: compact ? 19 : 21, lineHeight: compact ? 21 : 23 }}>{icon}</Text>,
});

function CalendarStack() {
  const { isCoach } = useAuth();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={({ navigation }) => ({ title: 'Calendario', headerRight: () => <ProfileButton navigation={navigation} /> })}
      />
      <Stack.Screen name="NewActivity" component={NewActivityScreen} options={{ title: 'Nuova attività' }} />
      <Stack.Screen name="DayWorkouts" component={DayWorkoutsScreen} options={{ title: 'Workout del giorno' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      {isCoach && <Stack.Screen name="WorkoutEditor" component={WorkoutEditorScreen} options={{ title: 'Editor workout' }} />}
      {isCoach && <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />}
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function DietsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Diets" component={DietsScreen} options={{ title: 'Diete' }} />
      <Stack.Screen name="DietDetail" component={DietDetailScreen} options={{ title: 'Dettaglio dieta' }} />
      <Stack.Screen name="DietEditor" component={DietEditorScreen} options={{ title: 'Editor dieta' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function PaymentsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PaymentsHome" component={PaymentsScreen} options={{ title: 'Pagamenti' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function EnduranceStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="EnduranceHome" component={EnduranceScreen} options={{ title: 'Endurance' }} />
      <Stack.Screen name="EndurancePlanDetail" component={EndurancePlanDetailScreen} options={{ title: 'Piano endurance' }} />
      <Stack.Screen name="EnduranceWorkoutEditor" component={EnduranceWorkoutEditorScreen} options={{ title: 'Nuovo allenamento' }} />
      <Stack.Screen name="FunctionalWorkoutEditor" component={FunctionalWorkoutEditorScreen} options={{ title: 'Nuovo funzionale' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function VideosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="VideosHome" component={VideosScreen} options={{ title: 'Video tutorial' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function StrengthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="StrengthHome" component={StrengthScreen} options={{ title: 'Pesistica' }} />
      <Stack.Screen name="StrengthSheetDetail" component={StrengthSheetDetailScreen} options={{ title: 'Scheda pesistica' }} />
      <Stack.Screen name="StrengthSheetEditor" component={StrengthSheetEditorScreen} options={{ title: 'Nuova scheda' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      <Stack.Screen name="WorkoutEditor" component={WorkoutEditorScreen} options={{ title: 'Nuova scheda' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function ZonesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ZonesHome" component={ZonesScreen} options={{ title: 'Zone' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function TemplatesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="TemplatesHome" component={TemplatesScreen} options={{ title: 'Template' }} />
      <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} options={{ title: 'Dettaglio template' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function ClientsTabStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ClientsHome" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { isCoach, enduranceEnabled } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: compact ? 10 : 13, fontWeight: '600' },
        tabBarItemStyle: { minWidth: 0, flex: 1 },
        tabBarStyle: { height: compact ? 64 : 72, paddingTop: compact ? 4 : 7, paddingBottom: compact ? 5 : 8 },
      }}
    >
      <Tab.Screen name="CalendarTab" component={CalendarStack} options={tabOptions('Calendario', 'Calend.', '⌂', compact)} />
      <Tab.Screen name="DietsTab" component={DietsStack} options={tabOptions('Diete', 'Diete', '◉', compact)} />
      <Tab.Screen name="PaymentsTab" component={PaymentsStack} options={tabOptions('Pagamenti', 'Pagam.', '€', compact)} />
      {enduranceEnabled && <Tab.Screen name="EnduranceTab" component={EnduranceStack} options={tabOptions('Endurance', 'Endur.', '➤', compact)} />}
      <Tab.Screen name="StrengthTab" component={StrengthStack} options={tabOptions('Pesistica', 'Pesi', '⚑', compact)} />
      {enduranceEnabled && <Tab.Screen name="ZonesTab" component={ZonesStack} options={tabOptions('Zone', 'Zone', '◈', compact)} />}
      {isCoach && enduranceEnabled && <Tab.Screen name="TemplatesTab" component={TemplatesStack} options={tabOptions('Template', 'Templ.', '▦', compact)} />}
      {isCoach && <Tab.Screen name="VideosTab" component={VideosStack} options={tabOptions('Video tutorial', 'Video', '▶', compact)} />}
      {isCoach && <Tab.Screen name="ClientsTab" component={ClientsTabStack} options={tabOptions('Atleti', 'Atleti', '♙', compact)} />}
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <AthleteProvider>
      <MainTabs />
    </AthleteProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
