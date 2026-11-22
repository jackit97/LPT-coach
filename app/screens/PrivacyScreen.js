import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

// Informativa privacy e termini d'uso. ATTENZIONE: i dati tra [parentesi quadre] vanno completati
// dal titolare del trattamento; per la versione definitiva e' consigliato il parere di un consulente privacy.
export const PRIVACY_SECTIONS = [
  ['Titolare del trattamento', 'Filippo Cavallini, via Trebbo 11, Argenta (FE), P.IVA [numero], email filippocavallini.coach@gmail.com.'],
  ['Quali dati trattiamo', 'Dati di registrazione (nome, cognome, email, password cifrata); dati del profilo (data di nascita, sesso, peso, altezza, obiettivi, giorni di allenamento); dati sugli allenamenti (programmi, feedback, RPE, carichi, serie, note); dati da dispositivi e app collegate (frequenza cardiaca, percorsi GPS, passo, potenza, attività importate da file o da Strava); piani alimentari; foto dei check e video di esecuzione; pagamenti registrati dal coach; dati tecnici di utilizzo (accessi, minuti di utilizzo, errori dell\'app).'],
  ['Dati sulla salute', 'Peso, frequenza cardiaca, alimentazione, foto dei progressi e altre informazioni fisiche sono "categorie particolari di dati" (art. 9 GDPR). Li trattiamo solo con il tuo consenso esplicito, per permettere al coach di programmare e seguire il tuo allenamento. Puoi revocare il consenso in qualsiasi momento scrivendo al titolare: in quel caso non sarà più possibile usare l\'app.'],
  ['Perché li trattiamo', 'Fornire il servizio di coaching (programmazione, monitoraggio, comunicazioni tra coach e atleta) sulla base del contratto; inviare notifiche in app e via email; garantire sicurezza e corretto funzionamento dell\'app (registro degli errori e degli accessi) sulla base del legittimo interesse; adempiere a obblighi di legge (es. fiscali per i pagamenti).'],
  ['Chi può vedere i dati', 'Il tuo coach; il personale tecnico che gestisce l\'app, solo per assistenza e manutenzione; i fornitori che ospitano il servizio come responsabili del trattamento: Cloudflare (hosting e archiviazione file), Neon (database), il fornitore delle email transazionali e, solo se lo colleghi tu, Strava. Alcuni fornitori possono trattare dati fuori dall\'Unione Europea con le garanzie previste dal GDPR (clausole contrattuali standard / Data Privacy Framework). I dati non vengono venduti né usati per pubblicità.'],
  ['Per quanto tempo', 'Per tutta la durata del rapporto con il coach e fino alla cancellazione dell\'account; i dati di pagamento per il tempo richiesto dalla legge; i registri tecnici (errori e accessi) per al massimo 12 mesi.'],
  ['I tuoi diritti', 'Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati, opporti al trattamento e revocare i consensi, scrivendo a [email del titolare] o dalla sezione "Feedback / errori app". Hai diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).'],
  ['Termini d\'uso', 'L\'app è uno strumento di supporto al rapporto tra coach e atleta e non sostituisce il parere medico. Prima di iniziare un programma di allenamento o alimentare consulta il tuo medico. Sei responsabile della correttezza dei dati che inserisci e della riservatezza delle tue credenziali. Non caricare contenuti di terzi senza il loro consenso.'],
];

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Informativa privacy e termini d'uso</Text>
      <Text style={styles.meta}>Versione 2026-11 · ai sensi del Regolamento (UE) 2016/679 (GDPR)</Text>
      {PRIVACY_SECTIONS.map(([heading, text]) => (
        <React.Fragment key={heading}>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.body}>{text}</Text>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  heading: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.lg, marginBottom: 4 },
  body: { fontSize: 14, color: colors.text, lineHeight: 21 },
});
