from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta

# Function to calculate working days
def working_days(start_date, end_date):
    days = (end_date - start_date).days
    if days <= 0:
        return 0
    full_weeks, extra_days = divmod(days, 7)
    return full_weeks * 5 + min(extra_days, 5)

# Set up Flask and SQLAlchemy
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
db = SQLAlchemy(app)

# Template filter to convert date strings to date objects
@app.template_filter('to_date')
def to_date_filter(date_str):
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        return None

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    tasks = db.relationship('Task', backref='user', lazy=True)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task = db.Column(db.String(200), nullable=False)
    priority = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="In Progress")
    due_date = db.Column(db.String(20), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    creation_date = db.Column(db.String(20), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    notes = db.relationship('Note', backref='task', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(500), nullable=False)
    creation_date = db.Column(db.String(20), nullable=False)
    last_edit_date = db.Column(db.String(20), nullable=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)

# Home Page
@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    user = db.session.get(User, session['user_id'])
    tasks = Task.query.filter_by(user_id=user.id).all()
    today = datetime.now().date()

    # Check for tasks that meet the rainbow condition
    has_rainbow = any(
        task.status == "In Progress" and
        task.due_date and
        to_date_filter(task.due_date) and
        1 <= (to_date_filter(task.due_date) - today).days <= 7
        for task in tasks
    )

    # Get the selected task (if any)
    selected_task_id = request.args.get('selected_task')
    selected_task = Task.query.get(selected_task_id) if selected_task_id else None

    return render_template(
        'index.html',
        tasks=tasks,
        today=today,
        working_days=working_days,
        selected_task=selected_task,
        has_rainbow=has_rainbow
    )

# Login
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and user.password == password:
            session['user_id'] = user.id
            session['password'] = password  # Store password for confirmation
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password!', 'danger')
    return render_template('login.html')

# Register
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if User.query.filter_by(username=username).first():
            flash('Username already exists!', 'danger')
        else:
            new_user = User(username=username, password=password)
            db.session.add(new_user)
            db.session.commit()
            flash('Registration successful! Please log in.', 'success')
            return redirect(url_for('login'))
    return render_template('register.html')

# Logout
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('password', None)
    return redirect(url_for('login'))

# Add Task
@app.route('/add_task', methods=['POST'])
def add_task():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    task = request.form['task']
    priority = request.form['priority'].upper()
    due_date = request.form['due_date']
    category = request.form['category']

    # Validate priority
    priority_map = {"H": "High", "HIGH": "High", "M": "Medium", "MEDIUM": "Medium", "L": "Low", "LOW": "Low"}
    if priority not in priority_map:
        flash("Invalid priority! Use H (High), M (Medium), or L (Low).", "warning")
        return '''
            <script>
                alert("Invalid priority! Use H (High), M (Medium), or L (Low).");
                document.querySelector('input[name="priority"]').focus();
                window.history.back();
            </script>
        '''

    priority = priority_map[priority]

    # Format date
    try:
        if ' ' in due_date:
            day, month, year = due_date.split()
        elif '-' in due_date:
            day, month, year = due_date.split('-')
        else:
            flash("Invalid date format! Use 'dd mm yy', 'dd mm yyyy', 'dd-mm-yy', or 'dd-mm-yyyy'.", "warning")
            return redirect(url_for('index'))

        if len(year) == 2:
            year = f"20{year}"

        if not (day.isdigit() and month.isdigit() and year.isdigit()):
            flash("Invalid date format! Use numbers for day, month, and year.", "warning")
            return redirect(url_for('index'))

        # Ensure two digits for day and month
        day = day.zfill(2)
        month = month.zfill(2)
        due_date = f"{day}/{month}/{year}"
    except ValueError:
        flash("Invalid date format! Use 'dd mm yy', 'dd mm yyyy', 'dd-mm-yy', or 'dd-mm-yyyy'.", "warning")
        return redirect(url_for('index'))

    # Create a new task
    new_task = Task(
        task=task,
        priority=priority,
        status="In Progress",  # Default status
        due_date=due_date,
        category=category,
        creation_date=datetime.now().strftime("%d/%m/%Y %I:%M %p"),
        user_id=session['user_id']
    )
    db.session.add(new_task)
    db.session.commit()

    flash("Task added successfully!", "success")
    return redirect(url_for('index'))

# Edit Task
@app.route('/edit_task/<int:task_id>', methods=['GET', 'POST'])
def edit_task(task_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    task = Task.query.get_or_404(task_id)
    if request.method == 'POST':
        task.task = request.form['task']
        task.priority = request.form['priority']
        task.due_date = request.form['due_date']
        task.category = request.form['category']
        db.session.commit()
        flash('Task updated successfully!', 'success')
        return redirect(url_for('index'))
    return render_template('edit_task.html', task=task)

# Delete Task
@app.route('/delete_task/<int:task_id>')
def delete_task(task_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    task = Task.query.get_or_404(task_id)
    # Delete all notes associated with the task
    Note.query.filter_by(task_id=task_id).delete()
    db.session.delete(task)
    db.session.commit()
    flash('Task deleted successfully!', 'success')
    return redirect(url_for('index'))

# Complete Task
@app.route('/complete_task/<int:task_id>')
def complete_task(task_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    task = Task.query.get_or_404(task_id)
    task.status = "Completed"
    # Add a note for completion
    new_note = Note(
        content=f"Task completed on {datetime.now().strftime('%d/%m/%Y %I:%M %p')}",
        creation_date=datetime.now().strftime("%d/%m/%Y %I:%M %p"),
        task_id=task_id
    )
    db.session.add(new_note)
    db.session.commit()
    flash('Task marked as completed!', 'success')
    return redirect(url_for('index'))

# Revert Task to In Progress
@app.route('/revert_task/<int:task_id>')
def revert_task(task_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    task = Task.query.get_or_404(task_id)
    task.status = "In Progress"
    # Add a note for reverting
    new_note = Note(
        content=f"Task reverted to In Progress on {datetime.now().strftime('%d/%m/%Y %I:%M %p')}",
        creation_date=datetime.now().strftime("%d/%m/%Y %I:%M %p"),
        task_id=task_id
    )
    db.session.add(new_note)
    db.session.commit()
    flash('Task reverted to In Progress!', 'success')
    return redirect(url_for('index'))

# Add Note
@app.route('/add_note/<int:task_id>', methods=['POST'])
def add_note(task_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    content = request.form['note']
    new_note = Note(
        content=content,
        creation_date=datetime.now().strftime("%d/%m/%Y %I:%M %p"),
        task_id=task_id
    )
    db.session.add(new_note)
    db.session.commit()
    flash('Note added successfully!', 'success')
    return redirect(url_for('index', selected_task=task_id))

# Edit Note
@app.route('/edit_note/<int:note_id>', methods=['GET', 'POST'])
def edit_note(note_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    note = Note.query.get_or_404(note_id)
    if "Task completed" in note.content or "Task reverted" in note.content:
        flash('Completed or reverted notes cannot be edited!', 'danger')
        return redirect(url_for('index', selected_task=note.task_id))
    if request.method == 'POST':
        note.content = request.form['note']
        note.last_edit_date = datetime.now().strftime("%d/%m/%Y %I:%M %p")
        db.session.commit()
        flash('Note updated successfully!', 'success')
        return redirect(url_for('index', selected_task=note.task_id))
    return render_template('edit_note.html', note=note)

# Delete Note
@app.route('/delete_note/<int:note_id>')
def delete_note(note_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    note = Note.query.get_or_404(note_id)
    if "Task completed" in note.content or "Task reverted" in note.content:
        flash('Completed or reverted notes cannot be deleted!', 'danger')
        return redirect(url_for('index', selected_task=note.task_id))
    task_id = note.task_id
    db.session.delete(note)
    db.session.commit()
    flash('Note deleted successfully!', 'success')
    return redirect(url_for('index', selected_task=task_id))

# Run the app
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Create the database and tables
    app.run(host='0.0.0.0', port=5000, debug=True)  # Use 0.0.0.0 for external access


