import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Pressable, Text } from 'react-native';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AthleteProvider } from './context/AthleteContext';
import { colors } from './theme';

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
import VideosScreen from './screens/VideosScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: '700' },
};

function ProfileButton({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Profile')} style={{ paddingHorizontal: 8 }}>
      <Text style={{ color: colors.textInverse, fontWeight: '700' }}>Profilo</Text>
    </Pressable>
  );
}

function CalendarStack() {
  const { isCoach } = useAuth();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={({ navigation }) => ({ title: 'Calendario', headerRight: () => <ProfileButton navigation={navigation} /> })}
      />
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
    </Stack.Navigator>
  );
}

function PaymentsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PaymentsHome" component={PaymentsScreen} options={{ title: 'Pagamenti' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
    </Stack.Navigator>
  );
}

function EnduranceStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="EnduranceHome" component={EnduranceScreen} options={{ title: 'Endurance' }} />
      <Stack.Screen name="EndurancePlanDetail" component={EndurancePlanDetailScreen} options={{ title: 'Piano endurance' }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
    </Stack.Navigator>
  );
}

function VideosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="VideosHome" component={VideosScreen} options={{ title: 'Video tutorial' }} />
    </Stack.Navigator>
  );
}

function ClientsTabStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ClientsHome" component={ClientsScreen} options={{ title: 'I miei atleti' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { isCoach } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="CalendarTab" component={CalendarStack} options={{ title: 'Calendario' }} />
      <Tab.Screen name="DietsTab" component={DietsStack} options={{ title: 'Diete' }} />
      <Tab.Screen name="PaymentsTab" component={PaymentsStack} options={{ title: 'Pagamenti' }} />
      <Tab.Screen name="EnduranceTab" component={EnduranceStack} options={{ title: 'Endurance' }} />
      <Tab.Screen name="VideosTab" component={VideosStack} options={{ title: 'Video' }} />
      {isCoach && <Tab.Screen name="ClientsTab" component={ClientsTabStack} options={{ title: 'Atleti' }} />}
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
