import React, { useState, useEffect, useCallback } from "react";
import { supabase, acceptFriendRequest } from "../../supabaseClient.js";
import { useToast } from "../../components/ToastContext.jsx";
import { notifyInteraction } from "../../lib/notifyInteraction.js";
import { useCurrentUser } from "../../hooks/useCommunity.js";
import { COLORS } from "../../theme.js";
import { UserPlus, Clock, Users, Loader2 } from "lucide-react";
import { isValidAuthUserId } from "../../lib/currentUserId.js";

const FriendRequestButton = ({ targetId }) => {
