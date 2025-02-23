import Axios from 'axios'
import useAuthStore from './store/auth';
import useChannelsStore from './store/channels';
import useUserAgentsStore from './store/userAgents';
import usePlaylistsStore from './store/playlists';
import useEPGsStore from './store/epgs';

const axios = Axios.create({
  withCredentials: true,
})

const host = "http://192.168.1.151:9191"

const getAuthToken = async () => {
  const token = await useAuthStore.getState().getToken(); // Assuming token is stored in Zustand store
  return token;
};

export default class API {
  static async login(username, password) {
    const response = await fetch(`${host}/api/accounts/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    return await response.json()
  }

  static async refreshToken(refreshToken) {
    const response = await fetch(`${host}/api/accounts/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken })
    });

    const retval = await response.json();
    return retval;
  }

  static async logout() {
    const response = await fetch(`${host}/api/accounts/auth/logout/`, {
      method: 'POST',
    })

    return response.data.data
  }

  static async getChannels() {
    const response = await fetch(`${host}/api/channels/channels/`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async getChannelGroups() {
    const response = await fetch(`${host}/api/channels/groups/`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async addChannel(channel) {
    let body = null
    if (channel.logo_file) {
      body = new FormData();
      for (const prop in channel) {
        body.append(prop, channel[prop])
      }
    } else {
      body = {...channel}
      delete body.logo_file
      body = JSON.stringify(body)
    }

    const response = await fetch(`${host}/api/channels/channels/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        ...(channel.logo_file ? {} :{
          'Content-Type': 'application/json',
        })
      },
      body: body,
    });

    const retval = await response.json();
    if (retval.id) {
      useChannelsStore.getState().addChannel(retval)
    }

    return retval;
  }

  static async deleteChannel(id) {
    const response = await fetch(`${host}/api/channels/channels/${id}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    useChannelsStore.getState().removeChannels([id])
  }

  static async deleteChannels(channel_ids) {
    const response = await fetch(`${host}/api/channels/bulk-delete-channels/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel_ids }),
    });

    useChannelsStore.getState().removeChannels(channel_ids)
  }

  static async getStreams() {
    const response = await fetch(`${host}/api/channels/streams/`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async getUserAgents() {
    const response = await fetch(`${host}/api/core/useragents/`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async addUserAgent(values) {
    const response = await fetch(`${host}/api/core/useragents/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });

    const retval = await response.json();
    if (retval.id) {
      useUserAgentsStore.getState().addUserAgent(retval)
    }

    return retval;
  }

  static async updateUserAgent(values) {
    console.log(values)
    const {id, ...payload} = values
    const response = await fetch(`${host}/api/core/useragents/${id}/`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const retval = await response.json();
    if (retval.id) {
      useUserAgentsStore.getState().updateUserAgent(retval)
    }

    return retval;
  }

  static async deleteUserAgent(id) {
    const response = await fetch(`${host}/api/core/useragents/${id}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    useUserAgentsStore.getState().removeUserAgents([id])
  }

  static async getPlaylists() {
    const response = await fetch(`${host}/api/m3u/accounts/`, {
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async addPlaylist(values) {
    const response = await fetch(`${host}/api/m3u/accounts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });

    const retval = await response.json();
    if (retval.id) {
      usePlaylistsStore.getState().addPlaylist(retval)
    }

    return retval;
  }

  static async deletePlaylist(id) {
    const response = await fetch(`${host}/api/m3u/accounts/${id}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    useUserAgentsStore.getState().removePlaylists([id])
  }

  static async updatePlaylist(values) {
    const {id, ...payload} = values
    const response = await fetch(`${host}/api/m3u/accounts/${id}/`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const retval = await response.json();
    if (retval.id) {
      useUserAgentsStore.getState().updatePlaylist(retval)
    }

    return retval;
  }

  static async getEPGs() {
    const response = await fetch(`${host}/api/epg/sources/`, {
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async refreshPlaylist(id) {
    const response = await fetch(`${host}/api/m3u/refresh/${id}/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const retval = await response.json();
    return retval;
  }

  static async addEPG(values) {
    let body = null
    if (values.epg_file) {
      body = new FormData();
      for (const prop in values) {
        body.append(prop, values[prop])
      }
    } else {
      body = {...values}
      delete body.epg_file
      body = JSON.stringify(body)
    }

    const response = await fetch(`${host}/api/epg/sources/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        ...(values.epg_file ? {} :{
          'Content-Type': 'application/json',
        })
      },
      body,
    });

    const retval = await response.json();
    if (retval.id) {
      useEPGsStore.getState().addEPG(retval)
    }

    return retval;
  }

  static async deleteEPG(id) {
    const response = await fetch(`${host}/api/epg/sources/${id}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    });

    useEPGsStore.getState().removeEPGs([id])
  }

  static async refreshEPG(id) {
    const response = await fetch(`${host}/api/epg/import/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    });

    const retval = await response.json();
    return retval;
  }
}
