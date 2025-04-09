# 🎬 Dispatcharr — Your Ultimate IPTV & Stream Management Companion

<p align="center">
  <img src="https://raw.githubusercontent.com/Dispatcharr/Dispatcharr/refs/heads/main/frontend/src/images/logo.png" height="200" alt="Dispatcharr Logo" />
</p>

<p align="center"><strong>Inspired by the *arr family, built for streamers, self-hosters, and IPTV enthusiasts everywhere.</strong></p>

---

## 📖 What is Dispatcharr?

Dispatcharr is an **open-source powerhouse** for managing IPTV streams and EPG data with elegance and control.  
Born from necessity and built with passion, it started as a personal project by [**OkinawaBoss**](https://github.com/OkinawaBoss) and evolved with contributions from legends like [**dekzter**](https://github.com/dekzter), [**SergeantPanda**](https://github.com/SergeantPanda) and **Bucatini**.  

> Think of Dispatcharr as the *arr family’s IPTV cousin — simple, smart, and designed for streamers who want reliability and flexibility.

---

## ✨ Why You'll Love Dispatcharr  

✅ **Stream Collection & Management** — Import, organize, and serve IPTV streams with zero hassle.  
✅ **EPG Integration** — Manage Electronic Program Guides like a pro.  
✅ **Smart Failover** — Auto-switch to backup sources if a stream drops (because downtime is not an option!).  
✅ **M3U Import & Restreaming** — Make playlists work *your* way.  
✅ **Clean, Responsive UI** — Modern, intuitive, and built to get out of your way.  
✅ **Self-hosted freedom** — Total control in your hands.  

---

# 🚀 Get Started in Minutes  

### 🐳 Quick Start with Docker (Recommended)

```bash
docker pull dispatcharr/dispatcharr:latest
docker run -d \
  -p 9191:9191 \
  --name dispatcharr \
  dispatcharr/dispatcharr:latest
```
> Customize ports and volumes to fit your setup.  

---

### 🐳 Docker Compose Options  

| Use Case                | File                                                       | Description |
|-------------------------|------------------------------------------------------------|-------------|
| **All-in-One Deployment**   | [docker-compose.aio.yml](docker/docker-compose. aio.yml)    | ⭐ Recommended! A simple, all-in-one solution — everything runs in a single container for quick setup. |
| **Modular Deployment**       | [docker-compose.yml](docker/docker-compose.yml)            | Separate containers for Dispatcharr, Celery, and Postgres — perfect if you want more granular control. |
| **Development Environment** | [docker-compose.dev.yml](docker/docker-compose.dev.yml)    | Developer-friendly setup with pre-configured ports and settings for contributing and testing. |

---

### 🛠️ Building from Source (For the Adventurous)  

> ⚠️ **Warning**: Not officially supported — but if you're here, you know what you're doing!  

1. Clone the repo:
```bash
git clone https://github.com/Dispatcharr/Dispatcharr.git
cd Dispatcharr
```
2. (Optional) Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate
```
3. Install Python dependencies:
```bash
pip install -r requirements.txt
```
4. Migrate and start the backend:
```bash
python manage.py migrate
python manage.py runserver
```
5. Build the frontend:
```bash
cd frontend/
npm install
npm run build
```
6. Open [http://localhost:9191](http://localhost:9191) and start streaming!

---

## 🤝 Want to Contribute?  

We welcome **PRs, issues, ideas, and suggestions**!  
Here’s how you can join the party:  

- Follow our coding style and best practices.  
- Be respectful, helpful, and open-minded.  
- Respect the **CC BY-NC-SA license**.  

> Whether it’s writing docs, squashing bugs, or building new features, your contribution matters! 🙌  

---

## 📚 Roadmap & Documentation  

- 🗺️ **Roadmap:** Coming soon!  
- 📖 **Wiki:** In progress — tutorials, API references, and advanced setup guides on the way!  

---

## ❤️ Shoutouts  

A huge thank you to all the incredible open-source projects and libraries that power Dispatcharr. We stand on the shoulders of giants!  

---

## ⚖️ License  

> Dispatcharr is licensed under **CC BY-NC-SA 4.0**:  

- **BY**: Give credit where credit’s due.  
- **NC**: No commercial use.  
- **SA**: Share alike if you remix.  

For full license details, see [LICENSE](https://creativecommons.org/licenses/by-nc-sa/4.0/).  

---

## ✉️ Connect With Us  

Have a question? Want to suggest a feature? Just want to say hi?  
➡️ **[Open an issue](https://github.com/Dispatcharr/Dispatcharr/issues)** or reach out on our community channels (coming soon!).  

---

### 🚀 *Happy Streaming! The Dispatcharr Team*
