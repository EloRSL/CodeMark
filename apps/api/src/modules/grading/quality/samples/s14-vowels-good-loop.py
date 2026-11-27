line = input()
count = 0
for ch in line:
    if ch in "aeiouAEIOU":
        count += 1
print(count)
