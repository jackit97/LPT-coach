import React from 'react';
import api from '../api/client';
import ChatThread from './ChatThread';

// Chat di una segnalazione: botta e risposta tra chi l'ha inviata e il developer, con conferma di lettura.
export default function FeedbackThread({ feedbackId, isDev = false, onChanged }) {
  const load = async () => {
    const { data } = await api.get(`/dev/feedback/${feedbackId}/messages`);
    return {
      // il developer vede a destra i propri messaggi, l'utente i suoi
      messages: (data.messages || []).map((message, index) => ({
        key: `${message.message_id}-${index}`,
        mine: isDev ? message.da_developer : !message.da_developer,
        author: message.da_developer ? 'Developer' : isDev ? 'Utente' : 'Tu',
        testo: message.testo,
        created_at: message.created_at,
      })),
      otherReadAt: isDev ? data.letto_utente_at : data.letto_dev_at,
    };
  };
  const send = (testo) => api.post(`/dev/feedback/${feedbackId}/messages`, { testo });
  return (
    <ChatThread
      load={load}
      send={send}
      reloadKey={`feedback-${feedbackId}`}
      placeholder={isDev ? 'Rispondi all\'utente' : 'Scrivi una risposta'}
      onChanged={onChanged}
    />
  );
}
