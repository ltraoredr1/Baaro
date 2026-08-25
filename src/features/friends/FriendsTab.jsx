import { useState, useEffect } from 'react';
import { 
  getFollowers, 
  getFollowing, 
  getFriends, 
  getPendingRequests,
  followUser,
  unfollowUser,
  acceptFriendRequest,
  rejectFriendRequest
} from '../../supabaseClient.js';
import { getUserById } from '../../usersData.js';

export function FriendsTab() {
  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'friends') {
        const { data: ids } = await getFriends();
        const users = ids.map(id => getUserById(id)).filter(Boolean);
        setFriends(users);
      } else if (activeTab === 'followers') {
        const { data: ids } = await getFollowers();
        const users = ids.map(id => getUserById(id)).filter(Boolean);
        setFollowers(users);
      } else if (activeTab === 'following') {
        const { data: ids } = await getFollowing();
        const users = ids.map(id => getUserById(id)).filter(Boolean);
        setFollowing(users);
      } else if (activeTab === 'requests') {
        const { data } = await getPendingRequests();
        const users = data.map(req => ({
          ...req,
          ...getUserById(req.follower_id)
        })).filter(u => u.id);
        setPending(users);
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleFollow = async (userId) => {
    await followUser(userId);
    loadData();
  };

  const handleUnfollow = async (userId) => {
    await unfollowUser(userId);
    loadData();
  };

  const handleAccept = async (followId) => {
    await acceptFriendRequest(followId);
    loadData();
  };

  const handleReject = async (followId) => {
    await rejectFriendRequest(followId);
    loadData();
  };

  const tabs = [
    { id: 'friends', label: '👫 Amis' },
    { id: 'followers', label: '📥 Abonnés' },
    { id: 'following', label: '📤 Abonnements' },
    { id: 'requests', label: '📩 Demandes' }
  ];

  const renderUser = (user, type) => {
    if (!user) return null;
    const name = user.display_name || 'Membre';
    const handle = user.handle || '@utilisateur';
    const flag = user.flag || '🌍';
    const avatar = user.avatar;

    return (
      <div key={user.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800/70 transition">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <span className="text-2xl">{flag}</span>
          )}
          <div>
            <p className="font-semibold text-white">{name}</p>
            <p className="text-sm text-gray-400">{handle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {type === 'followers' && (
            <button 
              onClick={() => handleFollow(user.id)}
              className="bg-gold-500 text-black px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gold-400 transition"
            >
              + Suivre
            </button>
          )}
          {type === 'following' && (
            <button 
              onClick={() => handleUnfollow(user.id)}
              className="bg-gray-700 text-gray-300 px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-600 transition"
            >
              ✓ Suivi
            </button>
          )}
          {type === 'requests' && (
            <div className="flex gap-2">
              <button 
                onClick={() => handleAccept(user.id)}
                className="bg-green-500 text-black px-3 py-1.5 rounded-full text-sm font-medium hover:bg-green-400 transition"
              >
                ✓
              </button>
              <button 
                onClick={() => handleReject(user.id)}
                className="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-red-500/30 transition"
              >
                ✕
              </button>
            </div>
          )}
          {type === 'friends' && (
            <button className="bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full text-sm">
              💬
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-8 text-gray-400">
          <div className="animate-spin text-2xl mb-2">⏳</div>
          Chargement...
        </div>
      );
    }

    let list = [];
    let type = '';
    let emptyMsg = '';

    switch (activeTab) {
      case 'friends':
        list = friends;
        type = 'friends';
        emptyMsg = '👀 Aucun ami pour le moment.';
        break;
      case 'followers':
        list = followers;
        type = 'followers';
        emptyMsg = '📭 Aucun abonné.';
        break;
      case 'following':
        list = following;
        type = 'following';
        emptyMsg = '📭 Vous ne suivez personne.';
        break;
      case 'requests':
        list = pending;
        type = 'requests';
        emptyMsg = '✅ Aucune demande en attente.';
        break;
    }

    if (list.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{emptyMsg.split(' ')[0]}</p>
          <p>{emptyMsg}</p>
        </div>
      );
    }

    return <div className="space-y-2">{list.map((item) => renderUser(item, type))}</div>;
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-white mb-4">👥 Communauté</h2>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-gold-500 text-black'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderContent()}
    </div>
  );
    }
