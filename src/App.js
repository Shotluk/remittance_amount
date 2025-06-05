// App.js
import ExcelMatcher from './ExcelMatcher'; // Adjust path as needed

function App() {
  return (
    <div className="App">
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-xl font-bold">My Application</h1>
      </header>
      
      <main className="container mx-auto py-6 px-4">
        <ExcelMatcher />
      </main>
      
      
    </div>
  );
}

export default App;