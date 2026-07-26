// Live BAARO (audio/vidéo) pour les Débats/Lives — diffusion en étoile.
//
// Architecture retenue : contrairement à un mesh classique (où chaque
// appareil se connecte à tous les autres), ici seul l'hôte diffuse.
// L'hôte ouvre une connexion WebRTC directe avec chaque spectateur·ice
// et lui envoie son flux caméra/micro ; les spectateur·ices ne
// connectent qu'à l'hôte et n'envoient eux-mêmes aucun flux. Ça évite le
// problème du mesh (qui sature vite l'appareil de chacun dès que le
// groupe grandit) : ici, seul l'appareil de l'hôte doit envoyer son flux
// à chaque spectateur·ice, ce qui reste correct jusqu'à une vingtaine de
// spectateur·ices simultané·es environ (au-delà, ça dépend surtout du
// débit montant de l'hôte).
//
// Important — ce n'est PAS l'infrastructure de TikTok : TikTok fait
// transiter chaque live par des serveurs médias/CDN capables de tenir
// des dizaines de milliers de spectateur·ices. Ici, tout passe en direct
// entre l'appareil de l'hôte et ceux des spectateur·ices (pair-à-pair),
// donc la limite réelle est le débit montant de la personne qui diffuse.
// Pour un vrai passage à l'échelle (des centaines/milliers de
// spectateur·ices), il faudrait remplacer ce module par un service à
// serveur média central (SFU) comme LiveKit, Agora ou Daily.co — la
// logique de salon, de chat et d'IA resterait identique ; seule cette
// partie diffusion serait à substituer.
//
// Signalisation : les messages d'établissement de connexion (offres/
// réponses SDP, candidats ICE) transitent par un canal "broadcast" de
// Supabase Realtime, propre à chaque salon. Rien de tout cela n'est
// stocké en base — c'est éphémère, comme un signal téléphonique.
//
// Nombre de spectateur·ices en direct : utilise la "Presence" de
// Supabase Realtime (qui sait qui est connecté au salon à l'instant T),
// pas les lignes de la table `debate_participants` (qui ne reflètent pas
// forcément qui regarde *maintenant*, seulement qui a rejoint un jour).
//
// Réactions (cœurs) : diffusées de la même façon, sans jamais être
// stockées en base — comme les cœurs de TikTok, purement éphémères.
//
// Limite connue (sans TURN) : deux appareils derrière certains routeurs
// restrictifs (NAT symétrique, certains réseaux d'entreprise/4G) peuvent
// échouer à se connecter directement. Pour fiabiliser au-delà du usage
// "entre amis sur réseaux courants", il faut un serveur TURN — gratuit en
// petit volume chez des fournisseurs comme Metered.ca, Twilio ou
// Cloudflare Calls. Une fois obtenus, renseignez ces variables dans
// .env.local (elles sont optionnelles : sans elles, seuls les serveurs
// STUN publics de Google sont utilisés) :
//
//   VITE_TURN_URL=turn:votre-serveur:3478
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...

function iceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return servers;
}

// Gère la diffusion en étoile pour un salon donné.
// `selfId` = mon id, `hostId` = id de la personne qui diffuse (peut être
// moi-même). Callbacks : `onRemoteStream(stream)` — spectateur·ices
// uniquement, appelé à chaque flux de l'hôte reçu/mis à jour ;
// `onViewerCountChange(count)` — nombre de spectateur·ices actuel·les
// (hôte exclu·e) ; `onHostLeft()` — spectateur·ices uniquement, appelé
// quand l'hôte quitte le salon ; `onReaction()` — appelé à chaque cœur
// envoyé par quelqu'un dans le salon (moi y compris, rejoué localement
// côté appelant).
export function createLiveSession({ supabase, roomId, selfId, hostId, onRemoteStream, onViewerCountChange, onHostLeft, onReaction }) {
  const isHost = selfId === hostId;
  const peers = new Map(); // peerId -> RTCPeerConnection
  let localStream = null;
  const channel = supabase.channel(`debate-live:${roomId}`, {
    config: { broadcast: { self: false }, presence: { key: selfId } },
  });

  const send = (to, payload) => channel.send({ type: "broadcast", event: "signal", payload: { from: selfId, to, ...payload } });

  function ensurePeer(peerId, initiator) {
    if (peers.has(peerId)) return peers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    peers.set(peerId, pc);

    if (isHost && localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) send(peerId, { kind: "ice", candidate: e.candidate });
    };
    if (!isHost) {
      // Seul·es les spectateur·ices reçoivent un flux (celui de l'hôte).
      pc.ontrack = (e) => onRemoteStream?.(e.streams[0]);
    }
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        peers.delete(peerId);
      }
    };

    if (isHost && initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send(peerId, { kind: "offer", sdp: pc.localDescription });
      };
    }
    return pc;
  }

  channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
    if (payload.to !== selfId) return;
    const { from, kind } = payload;
    if (kind === "offer") {
      const pc = ensurePeer(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send(from, { kind: "answer", sdp: pc.localDescription });
    } else if (kind === "answer") {
      const pc = peers.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    } else if (kind === "ice") {
      const pc = peers.get(from);
      if (pc) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          /* candidat arrivé trop tôt/tard, sans conséquence */
        }
      }
    }
  });

  channel.on("broadcast", { event: "reaction" }, () => onReaction?.());

  // La Presence donne, en direct, qui est connecté·e au salon. L'hôte
  // s'en sert pour ouvrir une connexion vers chaque nouveau·elle
  // spectateur·ice ; tout le monde s'en sert pour le compteur affiché.
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    const ids = Object.keys(state);
    onViewerCountChange?.(Math.max(0, ids.length - (ids.includes(hostId) ? 1 : 0)));
    if (isHost) {
      ids.forEach((id) => {
        if (id !== selfId && !peers.has(id)) ensurePeer(id, true);
      });
    }
  });

  channel.on("presence", { event: "leave" }, ({ key }) => {
    const pc = peers.get(key);
    if (pc) {
      pc.close();
      peers.delete(key);
    }
    if (!isHost && key === hostId) onHostLeft?.();
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") channel.track({ joined_at: Date.now() });
  });

  return {
    // Hôte uniquement : (re)branche mon flux local sur chaque connexion
    // déjà ouverte (et sur celles qui s'ouvriront après).
    async setLocalStream(stream) {
      localStream = stream;
      if (!isHost) return;
      peers.forEach((pc) => {
        stream.getTracks().forEach((track) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === track.kind);
          if (sender) sender.replaceTrack(track);
          else pc.addTrack(track, stream);
        });
      });
    },
    replaceVideoTrack(track) {
      if (!isHost) return;
      peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(track);
      });
    },
    sendReaction() {
      channel.send({ type: "broadcast", event: "reaction", payload: { from: selfId } });
    },
    leave() {
      peers.forEach((pc) => pc.close());
      peers.clear();
      supabase.removeChannel(channel);
    },
  };
}

// Demande l'accès micro/caméra. `mode` = "video" (micro+caméra), "audio"
// (micro seul) ou "text" (aucun média, retourne null). Réservé à l'hôte :
// les spectateur·ices ne diffusent jamais de flux.
export async function getLocalMedia(mode) {
  if (mode === "text") return null;
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mode === "video" ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
  });
}
