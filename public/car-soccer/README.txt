Car Soccer static bundle

Source: the user's local /Users/akuszewski28/Downloads/car-soccer copy.
The game is a prebuilt, minified application; its original source is not included.

This copy uses PLAY.html as index.html so assets resolve within /car-soccer/.
The main bundle's service-worker preparation is skipped because its original
offline manifest assumes deployment at the domain root and contains hashes for
the unmodified files. The game instead loads its included assets over HTTPS.
Worker URLs and worker asset paths were adjusted for the /car-soccer/ folder.
The two large custom-map JSON files are split into 4 MiB pieces and assembled
by the main bundle when those maps are selected. This keeps each hosted file
below the Site source repository's object limit.

Local arena play is included. Online rooms and other server features require
the original game's APIs and may be unavailable on this static host.
