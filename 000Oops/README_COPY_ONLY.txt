FANTAG v3.3.0-b77 Browser/Android Web Shortcut Icon Full Files

Copy these files/folders directly into your live Fantag project:

  index.html          -> /opt/app/fantag/index.html
  src/App.jsx         -> /opt/app/fantag/src/App.jsx
  app/version.py      -> /opt/app/fantag/app/version.py
  public/             -> /opt/app/fantag/public/

This adds:
- browser tab favicon using the icon/mark assets
- Android Chrome/Add-to-Home-Screen icon through manifest.webmanifest
- mobile web app metadata
- public/icons copied from the uploaded icons folder
- public/marks copied from the uploaded marks folder

Install commands:

cd /opt/app
sudo cp /path/to/extracted/index.html /opt/app/fantag/index.html
sudo cp /path/to/extracted/src/App.jsx /opt/app/fantag/src/App.jsx
sudo cp /path/to/extracted/app/version.py /opt/app/fantag/app/version.py
sudo mkdir -p /opt/app/fantag/public
sudo cp -r /path/to/extracted/public/. /opt/app/fantag/public/
sudo chown -R sidscri:media /opt/app/fantag/index.html /opt/app/fantag/src/App.jsx /opt/app/fantag/app/version.py /opt/app/fantag/public
sudo chmod 664 /opt/app/fantag/index.html /opt/app/fantag/src/App.jsx /opt/app/fantag/app/version.py
sudo find /opt/app/fantag/public -type d -exec chmod 775 {} \;
sudo find /opt/app/fantag/public -type f -exec chmod 664 {} \;

Rebuild:

cd /opt/app
docker compose build --no-cache fantag-api fantag-ui
docker compose up -d --force-recreate --no-deps fantag-api fantag-ui

Verify inside the UI container:

docker exec -it fantag-ui sh -lc 'ls -lah /usr/share/nginx/html | head; ls -lah /usr/share/nginx/html/icons | head; test -f /usr/share/nginx/html/manifest.webmanifest && echo MANIFEST_OK; grep -R "3.3.0\|b77" /usr/share/nginx/html 2>/dev/null | head -20'

Open:
http://sidscri-services:8010/?v=b77-icons

Then hard refresh. On Android, remove the old home-screen shortcut and add it again so Android re-reads the manifest icon.
