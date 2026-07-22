# TODO

## 1. migrate runner to a bun cli with crustjs

1. migrate ./run-pi-lmstudio.sh to ./run 
2. (use a shebang that es mise x -- bun). 
3. use @crustjs/core to create a cli
4. accept named args for: agent (a list of availale ./harbor_agents/agents/*.py)
5. move ./harbor_agents/pi_lmstudio.py to ./harbor_agents/agents/pi_lmstudio.py

## 2. find and use better looking area bar chart lib 

current svg one is a bit crap

## 3. migrate app to a solidjs app 

1. discrete components for each part of the app
2. use impeccable skills for design and layout review
3. a github workflow that runs on push to main and builds to ./out

unknowns: 
 - tanstack router work with solidjs? 

knowns:
 - use tailwindcss
