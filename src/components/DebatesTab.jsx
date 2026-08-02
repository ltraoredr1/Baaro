import { useState } from "react";
import { Swords, ThumbsUp, ThumbsDown, Plus, Video, LogIn } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { DebateRoom } from "./DebateRoom.jsx";

const DEMO_DEBATES = [
  {
    id: "d1",
    title: "Faut-il automatiser les récompenses de créateurs via les Smart Contracts ?",
    category: "Gouvernance & Tech",
    creator: "Mamadou Sy",
    flag: "🇲🇱",
    forVotes: 142,
    againstVotes: 38,
    comments: [
      { id: "c1", author: "Sarah J.", side: "pour", text: "Oui ! Les smart contracts garantissent la transparence et éliminent les intermédiaires." },
      { id: "c2", author: "Lars H.", side: "contre", text: "Des audits de sécurité rigoureux sont nécessaires avant toute automatisation totale." }
    ]
  },
  {
    id: "d2",
    title: "Le mode de communication P2P hors-ligne doit-il devenir la priorité de BAARO ?",
    category: "Fonctionnalités",
    creator: "Elena Rostova",
    flag: "🇷🇺",
    forVotes: 210,
    againstVotes: 15,
    comments: [
      { id: "c3", author: "Kenji T.", side: "pour", text: "Crucial pour les zones à faible connectivité internet !" }
    ]
  }
];

export function DebatesTab({ onRewardPoints, userName = "Vous" }) {
  const { showToast, showPointsReward } = useToast();
  const [debates, setDebates] = useState(DEMO_DEBATES);
  const [activeDebateId, setActiveDebateId] = useState("d1");
  const [argumentText, setArgumentText] = useState("");
  const [argumentSide, setArgumentSide] = useState("pour");
  const [votedMap, setVotedMap] = useState({});

  // Session d'appel vidéo en cours : { mode: "host" | "guest", debate?, inviteCode? }
  const [callSession, setCallSession] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showJoinField, setShowJoinField] = useState(false);

  const activeDebate = debates.find((d) => d.id === activeDebateId) || debates[0];

  const handleVote = (debateId, side) => {
    if (votedMap[debateId]) {
      showToast("Vous avez déjà voté sur ce débat", "info");
      return;
    }

    setVotedMap((prev) => ({ ...prev, [debateId]: side }));
    setDebates((prev) =>
      prev.map((d) =>
        d.id === debateId
          ? {
              ...d,
              forVotes: d.forVotes + (side === "pour" ? 1 : 0),
              againstVotes: d.againstVotes + (side === "contre" ? 1 : 0)
            }
          : d
      )
    );

    onRewardPoints(5);
    showPointsReward(5, "Vote enregistré dans l'arène");
  };

  const handleAddArgument = (e) => {
    e.preventDefault();
    if (!argumentText.trim()) return;

    const newArg = {
      id: `arg_${Date.now()}`,
      author: "Vous",
      side: argumentSide,
      text: argumentText
    };

    setDebates((prev) =>
      prev.map((d) =>
        d.id === activeDebateId
          ? { ...d, comments: [...d.comments, newArg] }
          :
