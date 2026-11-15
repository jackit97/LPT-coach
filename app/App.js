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
import MoreScreen from './screens/MoreScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function BackButton({ navigation, route }) {
  // Le sezioni aperte da "Altro" non hanno uno schermo precedente nel proprio stack: tornano ad "Altro"
  const fromMore = !navigation.canGoBack() && route?.params?.fromMore;
  if (!navigation.canGoBack() && !fromMore) return null;
  return (
    <Pressable
      onPress={() => (fromMore ? navigation.navigate('MoreTab') : navigation.goBack())}
      style={{ paddingRight: 12, paddingVertical: 6 }}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={24} color={colors.textInverse} />
    </Pressable>
  );
}

const screenOptions = ({ navigation, route }) => ({
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: '700', fontSize: 18 },
  headerTitleAlign: 'left',
  headerShadowVisible: false,
  headerRight: () => <ProfileButton navigation={navigation} />,
  headerLeft: () => <BackButton navigation={navigation} route={route} />,
});

function ProfileButton({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Profile')} style={{ paddingHorizontal: 8 }} hitSlop={8} accessibilityLabel="Profilo">
      <Ionicons name="person-circle-outline" size={28} color={colors.textInverse} />
    </Pressable>
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
        options={({ navigation }) => ({ title: 'Calendario', headerRight: () => <ProfileButton navigation={navigation} /> })}
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
    </Stack.Navigator>
  );
}

function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="LibraryHome" component={WorkoutLibraryScreen} options={{ title: 'Libreria allenamenti' }} />
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
      <Stack.Screen name="EnduranceWorkoutEditor" component={EnduranceWorkoutEditorScreen} options={{ title: 'Allenamento endurance' }} />
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

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MoreHome" component={MoreScreen} options={{ title: 'Altro', headerLeft: () => null }} />
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
        tabBarInactiveTintColor: '#98A2B3',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
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
      <Tab.Screen name="CalendarTab" component={CalendarStack} options={tabOptions('Calendario', 'calendar')} />
      {isCoach && <Tab.Screen name="ClientsTab" component={ClientsTabStack} options={tabOptions('Atleti', 'people')} />}
      {isCoach && <Tab.Screen name="LibraryTab" component={LibraryStack} options={tabOptions('Libreria', 'library')} />}
      {!isCoach && <Tab.Screen name="StrengthTab" component={StrengthStack} options={tabOptions('Pesistica', 'barbell')} />}
      <Tab.Screen name="DietsTab" component={DietsStack} options={tabOptions('Diete', 'nutrition')} />
      {!isCoach && enduranceEnabled && <Tab.Screen name="ZonesTab" component={ZonesStack} options={tabOptions('Zone', 'speedometer')} />}
      <Tab.Screen name="MoreTab" component={MoreStack} options={tabOptions('Altro', 'grid')} />

      {/* Sezioni secondarie, aperte dalla pagina "Altro" */}
      {enduranceEnabled && <Tab.Screen name="EnduranceTab" component={EnduranceStack} options={hiddenTab('Endurance')} />}
      {isCoach && <Tab.Screen name="StrengthTab" component={StrengthStack} options={hiddenTab('Pesistica')} />}
      {isCoach && enduranceEnabled && <Tab.Screen name="ZonesTab" component={ZonesStack} options={hiddenTab('Zone')} />}
      {isCoach && enduranceEnabled && <Tab.Screen name="TemplatesTab" component={TemplatesStack} options={hiddenTab('Template')} />}
      {isCoach && <Tab.Screen name="VideosTab" component={VideosStack} options={hiddenTab('Video tutorial')} />}
      <Tab.Screen name="PaymentsTab" component={PaymentsStack} options={hiddenTab('Pagamenti')} />
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

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('LPT Coach Uncaught Error:', error, errorInfo);
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
      if (!url || !/strava=(connected|error)/.test(url)) return;
      const ok = /strava=connected/.test(url);
      const imported = (url.match(/[?&]n=(\d+)/) || [])[1];
      const title = ok ? 'Strava collegato' : 'Strava';
      const text = ok ? `Account collegato${imported ? `: importate ${imported} attività nel calendario` : ''}.` : 'Collegamento non riuscito, riprova dal Profilo.';
      // Alert di react-native-web non mostra nulla: sul web si usa l'alert del browser
      if (Platform.OS === 'web' && typeof window !== 'undefined') setTimeout(() => window.alert(`${title}\n${text}`), 600);
      else Alert.alert(title, text);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      notify(window.location.search);
      if (/strava=/.test(window.location.search) && window.history?.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
      return undefined;
    }
    Linking.getInitialURL().then(notify).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => notify(url));
    return () => subscription.remove();
  }, []);
}

export default function App() {
  useStravaReturnNotice();
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('ServiceWorker registrato con successo:', registration.scope);
          })
          .catch((error) => {
            console.log('Registrazione ServiceWorker fallita:', error);
          });
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </ErrorBoundary>
  );
}
