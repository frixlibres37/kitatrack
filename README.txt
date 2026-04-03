KitaTrack fixed upload package

Upload these 4 files to the ROOT of your GitHub repo:
- index.html
- demo.html
- pos.html
- admin.html

Then Vercel will deploy them.

Main URLs after deploy:
- /            -> landing page
- /demo.html   -> demo launcher
- /pos.html    -> customer POS app
- /admin.html  -> admin panel

Demo URLs:
- /pos.html?plan=basic&demo=true
- /pos.html?plan=business&demo=true
- /pos.html?plan=pro&demo=true

Notes:
- admin.html already has your Supabase anon key inserted
- This is still a web app, not an APK yet
