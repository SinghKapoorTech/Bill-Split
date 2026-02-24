import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { userService } from '@/services/userService';

export interface FriendSuggestion {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
}

export function useFriendSearch(searchQuery: string) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendSuggestion[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<FriendSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Load existing friends on mount or user change
  const loadFriends = async () => {
    if (!user) return;
    try {
      const hydratedFriends = await userService.getHydratedFriends(user.uid, false);
      setFriends(hydratedFriends);
    } catch (error) {
      console.error('Error loading friends for search:', error);
    }
  };

  useEffect(() => {
    loadFriends();
  }, [user]);

  // Filter friends based on input and search global users if email or username prefix
  useEffect(() => {
    const searchInput = searchQuery.trim();
    
    if (searchInput.length < 2) {
      setShowSuggestions(false);
      setFilteredFriends([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // 1. Filter local friends
    const filtered = friends.filter(friend =>
      friend?.name?.toLowerCase().includes(searchInput.toLowerCase())
    );
    
    // 2. Global search criteria
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchInput);
    const shouldSearchGlobal = isEmail || searchInput.length >= 2;

    if (shouldSearchGlobal) {
      let isActive = true;

      const performSearch = async () => {
        try {
          let globalUsers = [];
          
          if (isEmail) {
            const userByEmail = await userService.getUserByContact(searchInput);
            if (userByEmail) {
              globalUsers.push(userByEmail);
            }
          } else {
            globalUsers = await userService.searchUsersByUsername(searchInput);
          }

          if (!isActive) return;

          const newFiltered = [...filtered];

          for (const globalUser of globalUsers) {
            // Skip currently logged-in user
            if (user && globalUser.uid === user.uid) {
              continue;
            }

            const potentialFriendId = globalUser.uid;
            
            // Check if already in the suggestions
            const alreadyInFriends = newFiltered.some(f => 
              f.email === globalUser.email || 
              (f.id && f.id === globalUser.uid) ||
              (f.id && f.id === potentialFriendId)
            );
            
            if (!alreadyInFriends) {
              newFiltered.push({
                id: potentialFriendId,
                name: globalUser.displayName || 'App User',
                venmoId: globalUser.venmoId,
                email: globalUser.email,
                username: globalUser.username
              });
            }
          }
          
          setFilteredFriends(newFiltered);
          setShowSuggestions(newFiltered.length > 0);
        } catch (err) {
          console.error("Global search failed", err);
          if (isActive) {
            setFilteredFriends(filtered);
            setShowSuggestions(filtered.length > 0);
          }
        } finally {
          if (isActive) {
            setIsSearching(false);
          }
        }
      };

      performSearch();

      return () => {
        isActive = false;
      };
    } else {
      setFilteredFriends(filtered);
      setShowSuggestions(filtered.length > 0);
      setIsSearching(false);
    }
  }, [searchQuery, friends, user]);

  return {
    friends,
    filteredFriends,
    showSuggestions,
    setShowSuggestions,
    isSearching,
    loadFriends
  };
}
