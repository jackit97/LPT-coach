import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Pressable, Text, TextInput, Platform, useWindowDimensions, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AthleteProvider } from './context/AthleteContext';
import { colors } from './theme';
import { useEffect } from 'react';

// Avoid white-on-white inputs: some Android/Chrome auto-dark modes invert unstyled text fields.
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.placeholderTextColor = colors.textMuted;
// Su web/PWA Alert.alert di react-native-web non fa nulla: messaggi di conferma ("Salvato in libreria")
// e richieste di conferma ("Elimina?") non comparivano. Li mappiamo su alert/confirm del browser.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = Array.isArray(buttons) ? buttons : [];
    if (list.length <= 1) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const cancel = list.find((button) => button.style === 'cancel');
    const confirmButton = list.find((button) => button !== cancel) || list[list.length - 1];
    if (window.confirm(text)) confirmButton?.onPress?.();
    else cancel?.onPress?.();
  };
}

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
import WorkoutLibraryScreen from './screens/WorkoutLibraryScreen';
import TemplateDetailScreen from './screens/TemplateDetailScreen';
import ZonesScreen from './screens/ZonesScreen';
import BodyAssessmentScreen from './screens/BodyAssessmentScreen';
import BodyAssessmentEditorScreen from './screens/BodyAssessmentEditorScreen';
import AppUpdater from './components/AppUpdater';
import api from './api/client';
import MoreScreen from './screens/MoreScreen';
import ExercisesScreen from './screens/ExercisesScreen';
import ChecksScreen from './screens/ChecksScreen';
import ReportsScreen from './screens/ReportsScreen';
import LibraryScreen from './screens/LibraryScreen';
import PlanEditorScreen from './screens/PlanEditorScreen';
import CoachHomeScreen from './screens/CoachHomeScreen';
import AthleteHubScreen from './screens/AthleteHubScreen';
import AthleteHomeScreen from './screens/AthleteHomeScreen';
import CoachTipsScreen from './screens/CoachTipsScreen';
import ReportDetailScreen from './screens/ReportDetailScreen';
import CheckDetailScreen from './screens/CheckDetailScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import PrivacyScreen from './screens/PrivacyScreen';
import ConsentScreen from './screens/ConsentScreen';
import DevDashboardScreen from './screens/dev/DevDashboardScreen';
import DevErrorsScreen from './screens/dev/DevErrorsScreen';
import DevFeedbackScreen from './screens/dev/DevFeedbackScreen';
import { installGlobalErrorHandlers, reportError, setCurrentScreen } from './utils/errorReporter';
import { NotificationsProvider, useNotifications } from './context/NotificationsContext';
import { useAthlete } from './context/AthleteContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function BackButton({ navigation, route }) {
  // Le sezioni aperte da "Altro" (atleta) o dalla pagina dell'atleta (coach) non hanno uno schermo
  // precedente nel proprio stack: la freccia riporta da dove si era partiti.
  const { selectedAthlete } = useAthlete();
  const root = !navigation.canGoBack();
  const fromMore = root && route?.params?.fromMore;
  const fromHub = root && route?.params?.fromHub;
  const fromHome = root && route?.params?.fromHome;
  if (root && !fromMore && !fromHub && !fromHome) return null;
  const goBack = () => {
    if (fromHub) navigation.navigate('HomeTab', { screen: 'AthleteHub', params: { athleteId: selectedAthlete?.utenteid } });
    else if (fromHome) navigation.navigate('HomeTab', { screen: 'CoachHome' });
    else if (fromMore) navigation.navigate('MoreTab');
    else navigation.goBack();
  };
  return (
    <Pressable
      onPress={goBack}
      style={{ paddingRight: 12, paddingVertical: 6 }}
      hitSlop={8}
    >
      <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
    </Pressable>
  );
}

const screenOptions = ({ navigation, route }) => ({
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: '700', fontSize: 18 },
  headerTitleAlign: 'left',
  headerShadowVisible: false,
  headerRight: () => <HeaderActions navigation={navigation} />,
  headerLeft: () => <BackButton navigation={navigation} route={route} />,
});

// Campanella con il numero di notifiche non lette
function NotificationBell({ navigation }) {
  const { unread } = useNotifications();
  return (
    <Pressable onPress={() => navigation.navigate('NotificationsTab', { screen: 'NotificationsHome' })} style={{ paddingHorizontal: 8 }} hitSlop={8} accessibilityLabel="Notifiche">
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={25} color={colors.textInverse} />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.primary }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ProfileButton({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Profile')} style={{ paddingHorizontal: 8 }} hitSlop={8} accessibilityLabel="Profilo">
      <Ionicons name="person-circle-outline" size={28} color={colors.textInverse} />
    </Pressable>
  );
}

function HeaderActions({ navigation }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <NotificationBell navigation={navigation} />
      <ProfileButton navigation={navigation} />
    </View>
  );
}

// Icona Ionicons: piena quando la voce e' attiva, contorno altrimenti, con "pillola" evidenziata.
const tabOptions = (label, icon) => ({
  title: label,
  tabBarLabel: label,
  tabBarIcon: ({ color, focused }) => (
    <View style={{ width: 48, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primaryLight : 'transparent' }}>
      <Ionicons name={focused ? icon : `${icon}-outline`} size={21} color={color} />
    </View>
  ),
});

// Voci non mostrate nella barra (raggiungibili da "Altro")
const hiddenTab = (label) => ({ title: label, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } });

function CalendarStack() {
  const { isCoach } = useAuth();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: 'Calendario' }}
      />
      <Stack.Screen name="NewActivity" component={NewActivityScreen} options={{ title: 'Nuova attività' }} />
      <Stack.Screen name="DayWorkouts" component={DayWorkoutsScreen} options={{ title: 'Workout del giorno' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      {isCoach && <Stack.Screen name="WorkoutEditor" component={WorkoutEditorScreen} options={{ title: 'Editor workout' }} />}
      {isCoach && <Stack.Screen name="EnduranceWorkoutEditor" component={EnduranceWorkoutEditorScreen} options={{ title: 'Allenamento endurance' }} />}
      {isCoach && <Stack.Screen name="FunctionalWorkoutEditor" component={FunctionalWorkoutEditorScreen} options={{ title: 'Allenamento funzionale' }} />}
      {isCoach && <Stack.Screen name="WorkoutLibrary" component={WorkoutLibraryScreen} options={{ title: 'Libreria allenamenti' }} />}
      {isCoach && <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />}
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="LibraryHome" component={LibraryScreen} options={{ title: 'Libreria' }} />
      <Stack.Screen name="PlanEditor" component={PlanEditorScreen} options={{ title: 'Piano' }} />
      <Stack.Screen name="WorkoutEditor" component={WorkoutEditorScreen} options={{ title: 'Allenamento' }} />
      <Stack.Screen name="EnduranceWorkoutEditor" component={EnduranceWorkoutEditorScreen} options={{ title: 'Allenamento endurance' }} />
      <Stack.Screen name="FunctionalWorkoutEditor" component={FunctionalWorkoutEditorScreen} options={{ title: 'Allenamento funzionale' }} />
      <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} options={{ title: 'Template endurance' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

// Home dell'atleta: allenamento del giorno, messaggi del coach, prossimi allenamenti
function AthleteHomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AthleteHome" component={AthleteHomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

// Home del coach: Coach Assistant + atleti; la pagina dell'atleta porta a tutte le sue sezioni
function CoachHomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="CoachHome" component={CoachHomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="AthleteHub" component={AthleteHubScreen} options={{ title: 'Atleta' }} />
      <Stack.Screen name="CoachTips" component={CoachTipsScreen} options={{ title: 'Consigli' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
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
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function PaymentsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PaymentsHome" component={PaymentsScreen} options={{ title: 'Pagamenti' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function EnduranceStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="EnduranceHome" component={EnduranceScreen} options={{ title: 'Endurance' }} />
      <Stack.Screen name="EndurancePlanDetail" component={EndurancePlanDetailScreen} options={{ title: 'Piano endurance' }} />
      <Stack.Screen name="EnduranceWorkoutEditor" component={EnduranceWorkoutEditorScreen} options={{ title: 'Allenamento endurance' }} />
      <Stack.Screen name="FunctionalWorkoutEditor" component={FunctionalWorkoutEditorScreen} options={{ title: 'Nuovo funzionale' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function VideosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="VideosHome" component={VideosScreen} options={{ title: 'Video tutorial' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function StrengthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="StrengthHome" component={StrengthScreen} options={{ title: 'Pesistica' }} />
      <Stack.Screen name="StrengthSheetDetail" component={StrengthSheetDetailScreen} options={{ title: 'Scheda pesistica' }} />
      <Stack.Screen name="StrengthSheetEditor" component={StrengthSheetEditorScreen} options={({ route }) => ({ title: route.params?.editSheet ? 'Modifica scheda' : 'Nuova scheda' })} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Dettaglio workout' }} />
      <Stack.Screen name="WorkoutEditor" component={WorkoutEditorScreen} options={{ title: 'Nuova scheda' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function ZonesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ZonesHome" component={ZonesScreen} options={{ title: 'Zone' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function TemplatesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="TemplatesHome" component={TemplatesScreen} options={{ title: 'Template' }} />
      <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} options={{ title: 'Dettaglio template' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function ClientsTabStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ClientsHome" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function ExercisesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ExercisesHome" component={ExercisesScreen} options={{ title: 'Catalogo esercizi' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ReportsHome" component={ReportsScreen} options={{ title: 'Report atleti' }} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: 'Report allenamento' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function BodyStack() {
  const { isCoach } = useAuth();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="BodyHome" component={BodyAssessmentScreen} options={{ title: 'Valutazione corporea' }} />
      {isCoach && <Stack.Screen name="BodyEditor" component={BodyAssessmentEditorScreen} options={({ route }) => ({ title: route.params?.assessment ? 'Modifica valutazione' : 'Nuova valutazione' })} />}
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function ChecksStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ChecksHome" component={ChecksScreen} options={{ title: 'Check fotografici' }} />
      <Stack.Screen name="CheckDetail" component={CheckDetailScreen} options={{ title: 'Check' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="NotificationsHome" component={NotificationsScreen} options={{ title: 'Notifiche' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MoreHome" component={MoreScreen} options={{ title: 'Altro', headerLeft: () => null }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
    </Stack.Navigator>
  );
}

// Profilo developer: utilizzo dell'app, errori e segnalazioni
function devStack(name, component, title) {
  return function DevStack() {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name={name} component={component} options={{ title, headerLeft: () => null }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profilo' }} />
        <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback / errori app' }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy' }} />
      </Stack.Navigator>
    );
  };
}
const DevHomeStack = devStack('DevHome', DevDashboardScreen, 'Developer');
const DevErrorsStack = devStack('DevErrors', DevErrorsScreen, 'Errori');
const DevFeedbackStack = devStack('DevFeedback', DevFeedbackScreen, 'Segnalazioni');

function MainTabs() {
  const { isCoach, isDeveloper, enduranceEnabled, dietEnabled, strengthEnabled } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#98A2B3',
        // l'atleta ha fino a 6 voci: su telefono il testo si riduce per non troncare "Calendario"
        tabBarLabelStyle: { fontSize: compact && !isCoach ? 10 : 11, fontWeight: '700', marginTop: 2 },
        tabBarIconStyle: { height: 30 },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          height: 74,
          paddingTop: 6,
          paddingBottom: 10,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...(compact ? {} : { paddingHorizontal: Math.max(0, (width - 760) / 2) }),
        },
      }}
    >
      {isDeveloper ? (
        <>
          <Tab.Screen name="DevHomeTab" component={DevHomeStack} options={tabOptions('Utilizzo', 'analytics')} />
          <Tab.Screen name="DevErrorsTab" component={DevErrorsStack} options={tabOptions('Errori', 'bug')} />
          <Tab.Screen name="DevFeedbackTab" component={DevFeedbackStack} options={tabOptions('Segnalazioni', 'chatbubbles')} />
          <Tab.Screen name="MoreTab" component={MoreStack} options={tabOptions('Altro', 'menu')} />
          <Tab.Screen name="NotificationsTab" component={NotificationsStack} options={hiddenTab('Notifiche')} />
        </>
      ) : isCoach ? (
        <>
          {/* Coach: Home (Coach Assistant + atleti), Atleti, Libreria, Report, Pagamenti */}
          <Tab.Screen name="HomeTab" component={CoachHomeStack} options={tabOptions('Home', 'home')} />
          <Tab.Screen name="ClientsTab" component={ClientsTabStack} options={tabOptions('Atleti', 'people')} />
          <Tab.Screen
            name="LibraryTab"
            component={LibraryStack}
            options={tabOptions('Libreria', 'library')}
            listeners={({ navigation }) => ({ tabPress: (event) => { event.preventDefault(); navigation.navigate('LibraryTab', { screen: 'LibraryHome', params: { athleteId: null, athleteName: null } }); } })}
          />
          <Tab.Screen
            name="ReportsTab"
            component={ReportsStack}
            options={tabOptions('Report', 'document-text')}
            listeners={({ navigation }) => ({ tabPress: (event) => { event.preventDefault(); navigation.navigate('ReportsTab', { screen: 'ReportsHome', params: { utenteId: null, athleteName: null } }); } })}
          />
          <Tab.Screen
            name="PaymentsTab"
            component={PaymentsStack}
            options={tabOptions('Pagamenti', 'card')}
            listeners={({ navigation }) => ({ tabPress: (event) => { event.preventDefault(); navigation.navigate('PaymentsTab', { screen: 'PaymentsHome', params: { fromHub: false } }); } })}
          />

          {/* Sezioni dell'atleta, aperte dalla sua pagina */}
          <Tab.Screen name="CalendarTab" component={CalendarStack} options={hiddenTab('Calendario')} />
          <Tab.Screen name="StrengthTab" component={StrengthStack} options={hiddenTab('Pesistica')} />
          <Tab.Screen name="DietsTab" component={DietsStack} options={hiddenTab('Diete')} />
          <Tab.Screen name="EnduranceTab" component={EnduranceStack} options={hiddenTab('Endurance')} />
          <Tab.Screen name="ZonesTab" component={ZonesStack} options={hiddenTab('Zone')} />
          <Tab.Screen name="ChecksTab" component={ChecksStack} options={hiddenTab('Check')} />
          <Tab.Screen name="BodyTab" component={BodyStack} options={hiddenTab('Valutazione corporea')} />
          <Tab.Screen name="TemplatesTab" component={TemplatesStack} options={hiddenTab('Template')} />
          <Tab.Screen name="VideosTab" component={VideosStack} options={hiddenTab('Video tutorial')} />
          <Tab.Screen name="ExercisesTab" component={ExercisesStack} options={hiddenTab('Esercizi')} />
          <Tab.Screen name="NotificationsTab" component={NotificationsStack} options={hiddenTab('Notifiche')} />
        </>
      ) : (
        <>
          <Tab.Screen name="HomeTab" component={AthleteHomeStack} options={tabOptions('Home', 'home')} />
          <Tab.Screen name="CalendarTab" component={CalendarStack} options={tabOptions('Calendario', 'calendar')} />
          {strengthEnabled && <Tab.Screen name="StrengthTab" component={StrengthStack} options={tabOptions('Pesistica', 'barbell')} />}
          {dietEnabled && <Tab.Screen name="DietsTab" component={DietsStack} options={tabOptions('Diete', 'restaurant')} />}
          {enduranceEnabled && <Tab.Screen name="ZonesTab" component={ZonesStack} options={tabOptions('Zone', 'speedometer')} />}
          <Tab.Screen name="MoreTab" component={MoreStack} options={tabOptions('Altro', 'menu')} />

          {/* Sezioni secondarie, aperte dalla pagina "Altro" */}
          {enduranceEnabled && <Tab.Screen name="EnduranceTab" component={EnduranceStack} options={hiddenTab('Endurance')} />}
          <Tab.Screen name="ChecksTab" component={ChecksStack} options={hiddenTab('Check')} />
          <Tab.Screen name="BodyTab" component={BodyStack} options={hiddenTab('Valutazione corporea')} />
          <Tab.Screen name="NotificationsTab" component={NotificationsStack} options={hiddenTab('Notifiche')} />
          <Tab.Screen name="PaymentsTab" component={PaymentsStack} options={hiddenTab('Pagamenti')} />
        </>
      )}
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading, account } = useAuth();

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

  // consensi privacy mancanti (account creati prima dell'aggiornamento): vanno dati prima di usare l'app
  if (account?.needsConsent) return <ConsentScreen />;

  return (
    <AthleteProvider>
      <NotificationsProvider>
        <MainTabs />
      </NotificationsProvider>
    </AthleteProvider>
  );
}

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('LPT Coach Uncaught Error:', error, errorInfo);
    reportError(error, { componentStack: errorInfo?.componentStack });
  }
  handleReset = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };
  handleClearCacheAndReload = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) await caches.delete(key);
        }
        window.localStorage.clear();
      } catch (e) {
        // ignore
      }
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: 8 }}>LPT Coach</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>Si è verificato un problema</Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 420, marginBottom: 20 }}>
            {this.state.error?.message || 'Errore durante il caricamento dell\'applicazione.'}
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Ricarica l'applicazione</Text>
          </Pressable>
          {Platform.OS === 'web' && (
            <Pressable onPress={this.handleClearCacheAndReload} style={{ padding: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Svuota cache e ricarica</Text>
            </Pressable>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

// Ritorno dal collegamento Strava: web (?strava=connected) o app nativa (lptcoach://strava-connected?...)
function useStravaReturnNotice() {
  useEffect(() => {
    const notify = (url) => {
      if (!url) return;
      let title;
      let text;
      if (/garmin=(connected|error|denied)/.test(url)) {
        const ok = /garmin=connected/.test(url);
        title = ok ? 'Garmin collegato' : 'Garmin';
        text = ok
          ? 'Account collegato: le attività che registri arriveranno da sole. Dal Profilo (o dal dettaglio di un allenamento) invia a Garmin gli allenamenti dei prossimi 7 giorni.'
          : /denied/.test(url) ? 'Autorizzazione annullata su Garmin.' : 'Collegamento non riuscito, riprova dal Profilo.';
      } else if (/pagamento=(ok|annullato)/.test(url)) {
        // ritorno da Stripe: il server verifica il pagamento e lo segna saldato
        const sessionId = (url.match(/[?&]session_id=([^&#]+)/) || [])[1];
        const show = (t, m) => (Platform.OS === 'web' && typeof window !== 'undefined' ? setTimeout(() => window.alert(`${t}\n${m}`), 600) : Alert.alert(t, m));
        if (/pagamento=annullato/.test(url) || !sessionId) { show('Pagamento', 'Pagamento annullato: puoi riprovare dalla sezione Pagamenti.'); return; }
        api.get('/payments/stripe/confirm', { params: { session_id: decodeURIComponent(sessionId) } })
          .then(({ data }) => show(data?.pagato ? 'Pagamento completato' : 'Pagamento', data?.message || 'Pagamento registrato'))
          .catch((e) => show('Pagamento', e?.response?.data?.message || 'Non è stato possibile verificare il pagamento: controlla nella sezione Pagamenti.'));
        return;
      } else if (/strava=(connected|error)/.test(url)) {
        const ok = /strava=connected/.test(url);
        const imported = (url.match(/[?&]n=(\d+)/) || [])[1];
        title = ok ? 'Strava collegato' : 'Strava';
        text = ok ? `Account collegato${imported ? `: importate ${imported} attività nel calendario` : ''}.` : 'Collegamento non riuscito, riprova dal Profilo.';
      } else return;
      // Alert di react-native-web non mostra nulla: sul web si usa l'alert del browser
      if (Platform.OS === 'web' && typeof window !== 'undefined') setTimeout(() => window.alert(`${title}\n${text}`), 600);
      else Alert.alert(title, text);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      notify(window.location.search);
      if (/(strava|garmin|pagamento)=/.test(window.location.search) && window.history?.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
      return undefined;
    }
    Linking.getInitialURL().then(notify).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => notify(url));
    return () => subscription.remove();
  }, []);
}

// nome della schermata attuale (allegato agli errori dell'app)
const routeName = (state) => {
  const route = state?.routes?.[state.index ?? 0];
  return route?.state ? routeName(route.state) : route?.name;
};

export default function App() {
  useStravaReturnNotice();
  useEffect(() => { installGlobalErrorHandlers(); }, []);

  return (
    <ErrorBoundary>
      <AppUpdater />
      <AuthProvider>
        <NavigationContainer onStateChange={(state) => setCurrentScreen(routeName(state))}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </ErrorBoundary>
  );
}
