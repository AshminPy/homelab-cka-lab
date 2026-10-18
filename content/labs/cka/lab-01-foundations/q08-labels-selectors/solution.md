## Solution

**0. Look at the labels first:**

```bash
k -n lab1-q8 get pods --show-labels
k -n lab1-q8 get pods -L env,tier          # labels as columns, easier to read
```

**1. Label the prod database Pods.** A comma in a selector means AND, so `env=prod,tier=db` matches only Pods with both labels:

```bash
k -n lab1-q8 get pods -l env=prod,tier=db                  # preview: alpha, delta
k -n lab1-q8 label pods -l env=prod,tier=db critical=true
```

**2. Delete the test Pods:**

```bash
k -n lab1-q8 get pods -l env=test                          # preview: bravo, echo
k -n lab1-q8 delete pods -l env=test
```

**3. List the remaining web Pods:**

```bash
k -n lab1-q8 get pods -l tier=web -o name | sed 's|^pod/||' | sort > {{qdir}}/web-pods.txt
cat {{qdir}}/web-pods.txt                                  # charlie, foxtrot
```

**Verify everything at once:**

```bash
k -n lab1-q8 get pods -L env,tier,critical
```

**How to picture it:** labels are tags on luggage at an airport. A selector is the instruction "pick every bag tagged `prod` AND `db`". You never need to know the bags' names; the tags do the work. This is exactly how Deployments find their Pods and Services find their endpoints.

**Selector cheat sheet:**

- `-l env=prod,tier=db`: both must match (AND)
- `-l 'env in (prod,test)'`: either value (OR on one key)
- `-l 'env!=test'`: everything except `test`
- `-l critical`: has the key, any value

**Exam tip:** before any `delete` or `label` with `-l`, run the same command as `get` first. It costs two seconds and stops you from deleting the wrong Pods, which you cannot undo.
