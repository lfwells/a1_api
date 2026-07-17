# Sample A1 server with Node+Express and MongoDB

## Local testing (with Docker)
To test on your own machine, navigate to the root of the directory and run
```sh
docker compose up -d
```
Then visit [http://localhost:5001/data](http://localhost:5001/data), or [http://localhost:5001/health](http://localhost:5001/health)

## Production Testing (on kit328.utas.edu.au)
1. SSH into server
2. Navigate to where I have already cloned the repo
```sh
cd ~/a1_api
```
3. Pull any changes
```sh
git pull
```
4. Rebuild the container
```sh
sudo docker compose up -d --build
```
5. Then visit [https://kit328.ict.utas.edu.au/a1_api/data](https://kit328.ict.utas.edu.au/a1_api/data), or [https://kit328.ict.utas.edu.au/a1_api/health](https://kit328.ict.utas.edu.au/a1_api/health)