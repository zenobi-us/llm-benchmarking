## migrate runner to a bun cli with crustjs

1. migrate ./run-pi-lmstudio.sh to ./run 
2. (use a shebang that es mise x -- bun). 
3. use @crustjs/core to create a cli
4. accept named args for: agent (a list of availale ./harbor_agents/agents/*.py)
5. move ./harbor_agents/pi_lmstudio.py to ./harbor_agents/agents/pi_lmstudio.py


