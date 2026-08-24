// src/lib/webrtc.js - Version Daily.co multi-hôtes + fallback P2P étoile
// Remplace entièrement ton ancien webrtc.js

let dailyCall = null
let localTracks = { audio: null, video: null }
let participants = new Map() // daily participants
let callbacks = { onParticipantJoined: null, onParticipantLeft: null, onTrack: null }

// Initialise Daily.co
export async function initDaily() {
  if (dailyCall) return dailyCall
  const DailyIframe = (await import('@daily-co/daily-js')).default
  dailyCall = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: true,
  })
  dailyCall.on('participant-joined', (e) => {
    participants.set(e.participant.session_id, e.participant)
    callbacks.onParticipantJoined?.(e.participant)
  })
  dailyCall.on('participant-left', (e) => {
    participants.delete(e.participant.session_id)
    callbacks.onParticipantLeft?.(e.participant)
  })
  dailyCall.on('track-started', (e) => {
    callbacks.onTrack?.(e)
  })
  return dailyCall
}

// Créer/rejoindre une room Daily via ton API serveur qui génère le token
export async function startLive({ roomName, token, isHost }) {
  const call = await initDaily()
  const url = `https://baaro.daily.co/${roomName}` // remplace baaro par ton domaine Daily
  // En dev, tu peux utiliser dailyRoomName généré par /api/create-room
  await call.join({ url, token, userName: isHost ? 'Host' : 'Viewer' })
  return call
}

export async function enableMic(enabled) {
  if (!dailyCall) return
  dailyCall.setLocalAudio(enabled)
}

export async function enableCamera(enabled) {
  if (!dailyCall) return
  dailyCall.setLocalVideo(enabled)
}

export function getParticipants() {
  return dailyCall ? dailyCall.participants() : {}
}

export async function leaveLive() {
  if (dailyCall) {
    await dailyCall.leave()
    dailyCall.destroy()
    dailyCall = null
  }
}

// Pour le mode co-hôte : upgrade local permissions (Daily gère via token)
export async function upgradeLocalRole(newRole) {
  // Le token Daily doit avoir été regénéré avec permissions owner
  // Côté UI on propose d'activer mic/cam après upgrade
  console.log('Upgraded to', newRole)
}

// Fallback P2P étoile (ton ancien système) si Daily pas configuré
export const p2pFallback = {
  // garde ton ancienne logique ici si VITE_DAILY_DOMAIN non défini
}

export function onEvent(event, cb) {
  callbacks[event] = cb
}
