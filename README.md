# Sample A1 server with Node+Express and MongoDB

## James's experience

Local testing is 'OK', but needed a lot of modifications to actually work:

- manually setting up the caddy_network? Unlcear what point this started working and at least _that_ part may be simpler when running on the production server
- uncontainerised `npm run dev` of Express and containerised MongoDB with exposed port (shifted by one in case locally installed MongoDB is occupying the default)
- shifting DB credentials into .env that is not committed to Git, listed in .dockerignore

I also placed the API key to alias mapping in an external file (not committed to Git) that is in .dockerignore but mounted for the containerised version of the Express app so should still be visible to it.

## Local testing (with Docker)

*Did not work as described*

To test on your own machine, navigate to the root of the directory and run
```sh
docker compose up -d
```
Then visit [http://localhost:5001/data](http://localhost:5001/data), or [http://localhost:5001/health](http://localhost:5001/health)

## Production Testing (on kit328.utas.edu.au)
1. SSH into server
2. Navigate to where Lindsay already cloned the repo
```sh
cd ~/a1_api
```
3. Ensure .env containing values for MONGO_ROOT_USER and MONGO_ROOT_PASSWORD is present. Ensure api/config directory and its contents are present, since these are deliberately excluded from Git
4. Pull any changes
```sh
git pull
```
6. Rebuild the container
```sh
sudo docker compose up -d --build
```
7. Then visit the _new_ path that hopefully will be James's API service... [https://kit328.ict.utas.edu.au/a1_api/data](https://kit328.ict.utas.edu.au/a1_api/data), or [https://kit328.ict.utas.edu.au/a1_api/health](https://kit328.ict.utas.edu.au/a1_api/health)