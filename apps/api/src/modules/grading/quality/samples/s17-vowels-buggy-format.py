line = input()
count = 0
for ch in line.lower():
    if ch in "aeiou":
        count += 1
print("Vowels:", count)
