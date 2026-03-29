#!/usr/bin/env python3
"""
WebAssign HTML parser — reads saved quiz/assignment pages and extracts
questions, submitted answers, correctness, and math expressions.

Usage: python3 parse_webassign.py < assignment.html
Output: JSON to stdout
"""
import sys
import json
import re
from bs4 import BeautifulSoup


def get_text(tag, sep=" "):
    """Return clean text from a tag, collapsing whitespace."""
    return re.sub(r'\s+', ' ', tag.get_text(sep)).strip()


def extract_math(tag):
    """
    Replace .mathquill-embedded-latex spans with $...$ notation.
    Returns a string with math inline.
    """
    # Clone so we don't mutate the real tree
    clone = BeautifulSoup(str(tag), 'lxml')
    for mq in clone.find_all(class_='mathquill-embedded-latex'):
        latex = mq.get_text().strip()
        mq.replace_with(f'${latex}$')
    return re.sub(r'\s+', ' ', clone.get_text(' ')).strip()


def parse_score_attr(tag):
    """
    WebAssign stores question metadata in data-question-display JSON.
    Returns (earned, possible) floats or (None, None).
    """
    raw = tag.get('data-question-display') or tag.get('data-question-info') or ''
    if not raw:
        # Walk up to find it
        for parent in tag.parents:
            raw = parent.get('data-question-display') or parent.get('data-question-info') or ''
            if raw:
                break
    if not raw:
        return None, None
    try:
        data = json.loads(raw)
        earned = data.get('score') or data.get('earned') or data.get('pointsEarned')
        possible = data.get('maxScore') or data.get('possible') or data.get('pointsPossible')
        return earned, possible
    except (json.JSONDecodeError, TypeError):
        return None, None


def parse_webassign(html: str) -> dict:
    soup = BeautifulSoup(html, 'lxml')

    # --- Assignment title ---
    title = ''
    title_tag = soup.find(class_=re.compile(r'assignment.?title|assnTitle|aTitle', re.I))
    if title_tag:
        title = get_text(title_tag)
    if not title:
        h1 = soup.find('h1')
        if h1:
            title = get_text(h1)
    if not title:
        title = (soup.title.get_text().strip() if soup.title else 'WebAssign Assignment')

    questions = []

    # --- Find question containers ---
    # Primary: .waQBox (main question wrapper)
    qboxes = soup.find_all(class_=re.compile(r'\bwaQBox\b'))
    if not qboxes:
        # Fallback: question number divs
        qboxes = soup.find_all(class_=re.compile(r'\bquestion\b', re.I))

    for qbox in qboxes:
        q = {}

        # Question number
        num_tag = qbox.find(class_=re.compile(r'waQNum|qNum|question.?number', re.I))
        q['number'] = get_text(num_tag) if num_tag else ''

        # Question text (strip nested answer boxes first)
        qtext_tag = qbox.find(class_=re.compile(r'waQBody|qBody|question.?body|questionText', re.I))
        if not qtext_tag:
            qtext_tag = qbox

        # Make a copy to extract question without answer fill-ins
        qtext_clone = BeautifulSoup(str(qtext_tag), 'lxml')
        for ans in qtext_clone.find_all(class_=re.compile(r'answer|response|entry|submit', re.I)):
            ans.decompose()
        q['question'] = extract_math(qtext_clone)

        # --- Answer parts ---
        answers = []

        # Each answer row / part (.waPQA, .waAB, .waPartRow, etc.)
        part_tags = qbox.find_all(class_=re.compile(r'\bwaPart\b|\bwaAB\b|\bpartRow\b|\banswerBlock\b', re.I))
        if not part_tags:
            # Treat the whole qbox as one part
            part_tags = [qbox]

        for part in part_tags:
            part_info = {}

            # Correct / incorrect markers
            correct_el = part.find(class_=re.compile(r'\bmCorrect\b|\bcorrect\b', re.I))
            incorrect_el = part.find(class_=re.compile(r'\bmIncorrect\b|\bincorrect\b', re.I))
            if correct_el:
                part_info['status'] = 'correct'
            elif incorrect_el:
                part_info['status'] = 'incorrect'
            else:
                part_info['status'] = 'unknown'

            # Submitted answer text
            submitted_tag = part.find(class_=re.compile(r'studentAnswer|submittedAnswer|givenAnswer|entered', re.I))
            if not submitted_tag:
                submitted_tag = correct_el or incorrect_el
            if submitted_tag:
                part_info['submitted'] = extract_math(submitted_tag)

            # Correct answer (shown after submission)
            correct_ans_tag = part.find(class_=re.compile(r'correctAnswer|solution|answerKey', re.I))
            if correct_ans_tag:
                part_info['correct_answer'] = extract_math(correct_ans_tag)

            # Score for this part
            earned, possible = parse_score_attr(part)
            if earned is not None:
                part_info['score'] = {'earned': earned, 'possible': possible}

            answers.append(part_info)

        q['answers'] = answers

        # Overall question score
        earned, possible = parse_score_attr(qbox)
        if earned is not None:
            q['score'] = {'earned': earned, 'possible': possible}

        questions.append(q)

    # --- Overall assignment score ---
    total_earned = total_possible = None
    score_tag = soup.find(class_=re.compile(r'totalScore|assignScore|aScore|gradeTotal', re.I))
    if score_tag:
        score_text = get_text(score_tag)
        m = re.search(r'([\d.]+)\s*/\s*([\d.]+)', score_text)
        if m:
            total_earned, total_possible = float(m.group(1)), float(m.group(2))

    return {
        'title': title,
        'questions': questions,
        'total_score': {'earned': total_earned, 'possible': total_possible}
            if total_earned is not None else None,
    }


def to_study_text(parsed: dict) -> str:
    """
    Convert parsed WebAssign data into a compact plain-text representation
    suitable for passing to the study guide generator.
    Math expressions are kept in $...$ inline notation.
    """
    lines = [f"Assignment: {parsed['title']}", ""]

    if parsed.get('total_score'):
        s = parsed['total_score']
        lines.append(f"Score: {s['earned']} / {s['possible']}")
        lines.append("")

    for q in parsed['questions']:
        num = q.get('number', '')
        prefix = f"Q{num}: " if num else "Q: "
        lines.append(f"{prefix}{q['question']}")

        for i, ans in enumerate(q.get('answers', []), 1):
            part_label = f"  Part {i}:" if len(q['answers']) > 1 else " "
            status = ans.get('status', 'unknown')
            submitted = ans.get('submitted', '')
            correct_ans = ans.get('correct_answer', '')

            if submitted:
                lines.append(f"{part_label} Submitted: {submitted} [{status}]")
            else:
                lines.append(f"{part_label} [{status}]")

            if correct_ans and status != 'correct':
                lines.append(f"  Correct answer: {correct_ans}")

            if ans.get('score'):
                s = ans['score']
                lines.append(f"  Score: {s['earned']} / {s['possible']}")

        if q.get('score'):
            s = q['score']
            lines.append(f"  Question score: {s['earned']} / {s['possible']}")

        lines.append("")

    return "\n".join(lines)


if __name__ == '__main__':
    html = sys.stdin.read()
    parsed = parse_webassign(html)

    if '--json' in sys.argv:
        print(json.dumps(parsed, ensure_ascii=False, indent=2))
    else:
        # Default: output structured text + JSON metadata on stderr
        study_text = to_study_text(parsed)
        meta = {
            'title': parsed['title'],
            'question_count': len(parsed['questions']),
            'total_score': parsed.get('total_score'),
        }
        # Write JSON meta to a separate line prefixed so Node can split it
        sys.stdout.write(study_text)
        sys.stdout.write('\n\n__META__' + json.dumps(meta) + '\n')
