# Comp5118 - Verifying Facts via KG
 COMP5118 Project - Verifying facts via Knowledge Graph


Dump neo4j:

bin/neo4j-admin dump --database=comp5118 --to=/Users/mosadioluwa/NodeProjects/COMP5118/data/graph.dump.db


Load Dump:

bin/neo4j-admin load --from=/Users/mosadioluwa/NodeProjects/COMP5118/data/graph.dump.db --database=comp5118 


conda env create -f environment.yml
conda activate openie

pip install stanford_openie
pip install graphviz

https://github.com/philipperemy/Stanford-OpenIE-Python


Title