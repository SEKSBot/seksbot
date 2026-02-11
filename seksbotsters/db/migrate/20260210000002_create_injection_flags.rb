class CreateInjectionFlags < ActiveRecord::Migration[7.0]
  def change
    create_table :injection_flags do |t|
      t.references :user, null: false, foreign_key: true, type: :bigint, unsigned: true
      t.references :flaggable, polymorphic: true, null: false
      t.text :reason, null: true  # Optional explanation
      t.timestamps
    end
    
    # Prevent duplicate flags from same user
    add_index :injection_flags, [:user_id, :flaggable_type, :flaggable_id], 
              unique: true, 
              name: 'index_injection_flags_unique_per_user'
  end
end
